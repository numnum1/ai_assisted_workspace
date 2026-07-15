import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { ChatMessage, ChatRequest } from '../types.ts';
import { attachAssistantStream, type StreamCallbacks } from './assistantStream.ts';

const noopSetContextInfo: StreamCallbacks['setContextInfo'] = () => {};

export interface PanelChatOptions {
  /** Chat mode string handed to the backend (prompt framing). Default 'review'. */
  mode?: string;
  /** Route through the lightweight quickChat path (no project references). Default true. */
  quickChat?: boolean;
}

/**
 * Ephemeral streaming chat for a docked AI panel (Schreibhilfe / Ideenfinder).
 *
 * Mirrors {@link useQuickChat}'s request/stream wiring — the one path we know is
 * live — but keeps its own in-memory transcript (never persisted) and lets the
 * caller inject a fresh context block per turn via the `resolved` argument to
 * {@link sendMessage}: the user sees their own words, the model receives the
 * words plus the current text as context (stored on `resolvedContent`).
 */
export function usePanelChat(options: PanelChatOptions = {}) {
  const { mode = 'review', quickChat = true } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const currentBaseRef = useRef<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const lastRequestRef = useRef<ChatRequest | null>(null);
  const llmIdRef = useRef<string | undefined>(undefined);

  const setLlmId = useCallback((id: string | undefined) => {
    llmIdRef.current = id;
  }, []);

  const buildHistoryPayload = useCallback((msgs: ChatMessage[]): ChatMessage[] => {
    return msgs.map((msg) => {
      if (msg.role === 'user') {
        return { role: 'user', content: msg.resolvedContent ?? msg.content };
      }
      if (msg.role === 'tool') {
        return { role: 'tool', content: msg.content, toolCallId: msg.toolCallId };
      }
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return { role: 'assistant', content: msg.content, toolCalls: msg.toolCalls };
      }
      return { role: msg.role, content: msg.content };
    });
  }, []);

  /**
   * @param display What the user typed (shown in the transcript).
   * @param resolved What the model actually receives — `display` plus any
   *   context preamble. Defaults to `display` when no context is injected.
   */
  const sendMessage = useCallback(
    (display: string, resolved?: string, opts?: { disabledToolkits?: string[] }) => {
      setError(null);
      setToolActivity(null);
      const sent = resolved ?? display;
      const userMsg: ChatMessage = { role: 'user', content: display, resolvedContent: sent };
      currentBaseRef.current = [...messagesRef.current, userMsg];
      setMessages(currentBaseRef.current);
      setStreaming(true);

      const disabledToolkits = opts?.disabledToolkits?.length ? [...opts.disabledToolkits] : undefined;
      const request: ChatRequest = {
        message: sent,
        activeFieldKey: null,
        mode,
        referencedFiles: [],
        history: buildHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: false,
        quickChat,
        llmId: llmIdRef.current,
        ...(disabledToolkits ? { disabledToolkits } : {}),
      };
      lastRequestRef.current = request;

      const cbs: StreamCallbacks = {
        setMessages,
        setStreaming,
        setError,
        setToolActivity,
        setContextInfo: noopSetContextInfo,
        currentBaseRef,
      };
      abortRef.current = attachAssistantStream(request, undefined, cbs);
    },
    [mode, quickChat, buildHistoryPayload],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (!request) return;
    setError(null);
    setStreaming(true);
    setToolActivity(null);
    const cbs: StreamCallbacks = {
      setMessages,
      setStreaming,
      setError,
      setToolActivity,
      setContextInfo: noopSetContextInfo,
      currentBaseRef,
    };
    abortRef.current = attachAssistantStream(request, undefined, cbs);
  }, []);

  const clearMessages = useCallback(() => {
    currentBaseRef.current = [];
    setMessages([]);
    setError(null);
    setToolActivity(null);
  }, []);

  return {
    messages,
    streaming,
    error,
    toolActivity,
    sendMessage,
    stopStreaming,
    retry,
    clearMessages,
    setLlmId,
  };
}
