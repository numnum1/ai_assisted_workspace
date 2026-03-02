import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ContextInfo } from '../types.ts';
import { streamChat } from '../api.ts';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        },
        (err) => {
          setError(err.message);
          setStreaming(false);
        },
      );

      abortRef.current = controller;
    },
    [messages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setContextInfo(null);
    setError(null);
  }, []);

  return {
    messages,
    streaming,
    contextInfo,
    error,
    sendMessage,
    stopStreaming,
    clearChat,
  };
}
