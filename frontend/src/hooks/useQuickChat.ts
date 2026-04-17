import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, ChatRequest, ContextInfo } from '../types.ts';
import { attachAssistantStream } from './assistantStream.ts';

const noopSetContextInfo: Dispatch<SetStateAction<ContextInfo | null>> = () => {};

export const QUICK_CHAT_STORAGE_KEY = 'markdown-project-quick-chat-v1';

export interface QuickChatPersistedV1 {
  v: 1;
  messages: ChatMessage[];
  pos: { x: number; y: number };
}

function defaultQuickChatPos(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 40, y: 80 };
  }
  const w = 384;
  return {
    x: Math.max(8, Math.min(window.innerWidth - w - 8, window.innerWidth - w - 16)),
    y: Math.max(8, Math.round(window.innerHeight * 0.08)),
  };
}

/** Load persisted Quick Chat messages and window position. */
export function loadQuickChatPersisted(): { messages: ChatMessage[]; pos: { x: number; y: number } } {
  try {
    const raw = localStorage.getItem(QUICK_CHAT_STORAGE_KEY);
    if (!raw) {
      return { messages: [], pos: defaultQuickChatPos() };
    }
    const p = JSON.parse(raw) as Partial<QuickChatPersistedV1>;
    if (p.v !== 1 || !Array.isArray(p.messages)) {
      return { messages: [], pos: defaultQuickChatPos() };
    }
    const pos =
      p.pos && typeof p.pos.x === 'number' && typeof p.pos.y === 'number' ? p.pos : defaultQuickChatPos();
    return { messages: p.messages, pos };
  } catch {
    return { messages: [], pos: defaultQuickChatPos() };
  }
}

function buildQuickHistoryPayload(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    if (msg.role === 'user') {
      return { role: 'user', content: msg.resolvedContent ?? msg.content };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
      };
    }
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content,
        toolCalls: msg.toolCalls,
      };
    }
    return { role: msg.role, content: msg.content };
  });
}

/**
 * Ephemeral Quick Chat (Alt+E): plain text, quickChat + web_search on the server, no project references.
 */
export function useQuickChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadQuickChatPersisted().messages);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentBaseRef = useRef<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const lastChatRequestRef = useRef<ChatRequest | null>(null);
  const llmIdRef = useRef<string | undefined>(undefined);

  const setLlmId = useCallback((id: string | undefined) => {
    llmIdRef.current = id;
  }, []);

  const sendMessage = useCallback((text: string, options?: { disabledToolkits?: string[] }) => {
    setError(null);
    setToolActivity(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    currentBaseRef.current = [...messagesRef.current, userMsg];
    setMessages(currentBaseRef.current);
    setStreaming(true);

    const disabledToolkits = options?.disabledToolkits?.length
      ? [...options.disabledToolkits]
      : undefined;
    const chatRequest: ChatRequest = {
      message: text,
      activeFile: null,
      activeFieldKey: null,
      mode: 'review',
      referencedFiles: [],
      history: buildQuickHistoryPayload(currentBaseRef.current.slice(0, -1)),
      useReasoning: false,
      quickChat: true,
      llmId: llmIdRef.current,
      ...(disabledToolkits != null && disabledToolkits.length > 0
        ? { disabledToolkits }
        : {}),
    };
    lastChatRequestRef.current = chatRequest;

    const streamCbs = {
      setMessages,
      setStreaming,
      setError,
      setToolActivity,
      setContextInfo: noopSetContextInfo,
      currentBaseRef,
    };
    abortRef.current = attachAssistantStream(chatRequest, undefined, streamCbs, undefined);
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const retry = useCallback(() => {
    const chatRequest = lastChatRequestRef.current;
    if (!chatRequest) return;
    setError(null);
    setStreaming(true);
    setToolActivity(null);
    const streamCbs = {
      setMessages,
      setStreaming,
      setError,
      setToolActivity,
      setContextInfo: noopSetContextInfo,
      currentBaseRef,
    };
    abortRef.current = attachAssistantStream(chatRequest, undefined, streamCbs, undefined);
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
