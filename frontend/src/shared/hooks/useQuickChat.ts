import { useCallback, useRef } from 'react';
import type { ChatMessage, ChatRequest } from '../types.ts';
import { useAiStream } from './useAiStream.ts';
import { buildChatHistoryPayload } from '../services/ai/chatHistory.ts';

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

/**
 * Ephemeral Quick Chat (Alt+E): plain text, quickChat + web_search on the server, no project references.
 * Wraps the shared {@link useAiStream} core with Quick Chat's request shape and persisted history.
 */
export function useQuickChat() {
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
  } = useAiStream(() => loadQuickChatPersisted().messages);

  const llmIdRef = useRef<string | undefined>(undefined);

  const setLlmId = useCallback((id: string | undefined) => {
    llmIdRef.current = id;
  }, []);

  const sendMessage = useCallback(
    (text: string, options?: { disabledToolkits?: string[] }) => {
      const userMsg: ChatMessage = { role: 'user', content: text };
      currentBaseRef.current = [...messagesRef.current, userMsg];
      setMessages(currentBaseRef.current);

      const disabledToolkits = options?.disabledToolkits?.length
        ? [...options.disabledToolkits]
        : undefined;
      const request: ChatRequest = {
        message: text,
        activeFieldKey: null,
        mode: 'review',
        referencedFiles: [],
        history: buildChatHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: false,
        quickChat: true,
        llmId: llmIdRef.current,
        ...(disabledToolkits != null && disabledToolkits.length > 0
          ? { disabledToolkits }
          : {}),
      };
      startStream(request);
    },
    [currentBaseRef, messagesRef, setMessages, startStream],
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
