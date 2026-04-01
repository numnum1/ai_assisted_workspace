import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types.ts';
import { streamChat } from '../api.ts';

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
  const llmIdRef = useRef<string | undefined>(undefined);

  const setLlmId = useCallback((id: string | undefined) => {
    llmIdRef.current = id;
  }, []);

  const sendMessage = useCallback((text: string) => {
    setError(null);
    setToolActivity(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    currentBaseRef.current = [...messages, userMsg];
    setMessages(currentBaseRef.current);
    setStreaming(true);

    let assistantContent = '';

    const controller = streamChat(
      {
        message: text,
        activeFile: null,
        activeFieldKey: null,
        mode: 'review',
        referencedFiles: [],
        history: buildQuickHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: false,
        quickChat: true,
        llmId: llmIdRef.current,
      },
      (token) => {
        assistantContent += token;
        setMessages([...currentBaseRef.current, { role: 'assistant', content: assistantContent }]);
        setToolActivity(null);
      },
      () => {
        /* Quick Chat ignores context bar */
      },
      () => {
        setStreaming(false);
        setToolActivity(null);
      },
      (err) => {
        setError(err.message);
        setStreaming(false);
        setToolActivity(null);
      },
      (description) => {
        setToolActivity(description);
      },
      () => {
        /* token estimate not shown in quick UI */
      },
      (toolMessages) => {
        currentBaseRef.current = [
          ...currentBaseRef.current,
          ...toolMessages.map((m) => ({ ...m, hidden: true })),
        ];
        setMessages(currentBaseRef.current);
      },
      (resolved) => {
        const base = [...currentBaseRef.current];
        for (let i = base.length - 1; i >= 0; i--) {
          if (base[i].role === 'user' && !base[i].hidden) {
            base[i] = { ...base[i], resolvedContent: resolved };
            break;
          }
        }
        currentBaseRef.current = base;
        setMessages(base);
      },
    );

    abortRef.current = controller;
  }, [messages]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
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
    clearMessages,
    setLlmId,
  };
}
