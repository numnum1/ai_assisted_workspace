import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ContextInfo } from '../types.ts';
import { streamChat } from '../api.ts';

export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void) {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Notify parent when messages change
  const setMessages = useCallback((msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((prev) => {
      const next = typeof msgs === 'function' ? msgs(prev) : msgs;
      // Defer callback to avoid setState-during-render
      setTimeout(() => onMessagesChangeRef.current?.(next), 0);
      return next;
    });
  }, []);

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessagesState(msgs);
    setContextInfo(null);
    setError(null);
    setToolActivity(null);
  }, []);

  const sendMessage = useCallback(
    (
      text: string,
      activeFile: string | null,
      mode: string,
      referencedFiles: string[],
      modeName?: string,
      modeColor?: string,
    ) => {
      setError(null);
      setToolActivity(null);
      const userMsg: ChatMessage = { role: 'user', content: text, mode: modeName, modeColor };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setStreaming(true);

      let assistantContent = '';

      const controller = streamChat(
        {
          message: text,
          activeFile,
          mode,
          referencedFiles,
          history: newMessages.slice(0, -1),
        },
        (token) => {
          setToolActivity(null);
          assistantContent += token;
          setMessages([
            ...newMessages,
            { role: 'assistant', content: assistantContent },
          ]);
        },
        (info) => {
          setContextInfo(info);
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
      );

      abortRef.current = controller;
    },
    [messages, setMessages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setContextInfo(null);
    setError(null);
    setToolActivity(null);
  }, [setMessages]);

  const forkFromMessage = useCallback((upToIndex: number) => {
    setMessages(prev => prev.slice(0, upToIndex + 1));
    setContextInfo(null);
    setError(null);
  }, [setMessages]);

  return {
    messages,
    streaming,
    contextInfo,
    error,
    toolActivity,
    sendMessage,
    stopStreaming,
    clearChat,
    forkFromMessage,
    loadMessages,
  };
}
