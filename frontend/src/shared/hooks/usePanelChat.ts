import { useCallback, useRef } from 'react';
import type { ChatMessage, ChatRequest } from '../types.ts';
import { useAiStream } from './useAiStream.ts';
import { buildChatHistoryPayload } from '../services/ai/chatHistory.ts';

export interface PanelChatOptions {
  /** Chat mode string handed to the backend (prompt framing). Default 'review'. */
  mode?: string;
  /** Route through the lightweight quickChat path (no project references). Default true. */
  quickChat?: boolean;
}

/**
 * Ephemeral streaming chat for a docked AI panel (Schreibhilfe / Ideenfinder).
 *
 * Wraps the shared {@link useAiStream} core. Keeps its own in-memory transcript
 * (never persisted) and lets the caller inject a fresh context block per turn via
 * the `resolved` argument to {@link sendMessage}: the user sees their own words,
 * the model receives the words plus the current text as context (stored on
 * `resolvedContent`).
 */
export function usePanelChat(options: PanelChatOptions = {}) {
  const { mode = 'review', quickChat = true } = options;

  const {
    messages,
    setMessages,
    streaming,
    error,
    toolActivity,
    currentBaseRef,
    messagesRef,
    startStream,
    stopStreaming,
    retry,
    clearMessages,
  } = useAiStream();

  const llmIdRef = useRef<string | undefined>(undefined);

  const setLlmId = useCallback((id: string | undefined) => {
    llmIdRef.current = id;
  }, []);

  /**
   * @param display What the user typed (shown in the transcript).
   * @param resolved What the model actually receives — `display` plus any
   *   context preamble. Defaults to `display` when no context is injected.
   */
  const sendMessage = useCallback(
    (display: string, resolved?: string, opts?: { disabledToolkits?: string[] }) => {
      const sent = resolved ?? display;
      const userMsg: ChatMessage = { role: 'user', content: display, resolvedContent: sent };
      currentBaseRef.current = [...messagesRef.current, userMsg];
      setMessages(currentBaseRef.current);

      const disabledToolkits = opts?.disabledToolkits?.length ? [...opts.disabledToolkits] : undefined;
      const request: ChatRequest = {
        message: sent,
        activeFieldKey: null,
        mode,
        referencedFiles: [],
        history: buildChatHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: false,
        quickChat,
        llmId: llmIdRef.current,
        ...(disabledToolkits ? { disabledToolkits } : {}),
      };
      startStream(request);
    },
    [mode, quickChat, currentBaseRef, messagesRef, setMessages, startStream],
  );

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
