import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ContextInfo, SelectionContext } from '../types.ts';
import { streamChat } from '../api.ts';

export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Skip syncing on initial mount and after loadMessages
  const syncEnabledRef = useRef(false);

  // Sync messages to history whenever they change
  useEffect(() => {
    if (!syncEnabledRef.current) return;
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    syncEnabledRef.current = false;
    setMessages(msgs);
    setContextInfo(null);
    setError(null);
    setToolActivity(null);
    // Re-enable sync after React processes the state update
    requestAnimationFrame(() => {
      syncEnabledRef.current = true;
    });
  }, []);

  const sendMessage = useCallback(
    (
      text: string,
      activeFile: string | null,
      mode: string,
      referencedFiles: string[],
      modeName?: string,
      modeColor?: string,
      useReasoning?: boolean,
      llmId?: string,
      selectionContext?: SelectionContext,
      activeFieldKey?: string | null,
    ) => {
      syncEnabledRef.current = true;
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
          activeFieldKey: activeFieldKey ?? null,
          mode,
          referencedFiles,
          history: newMessages.slice(0, -1),
          useReasoning: useReasoning ?? false,
          llmId: llmId,
        },
        (token) => {
          assistantContent += token;
          setMessages([
            ...newMessages,
            { role: 'assistant', content: assistantContent, selectionContext },
          ]);
          setToolActivity(null);
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
    [messages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const clearChat = useCallback(() => {
    syncEnabledRef.current = true;
    setMessages([]);
    setContextInfo(null);
    setError(null);
    setToolActivity(null);
  }, []);

  const forkFromMessage = useCallback((upToIndex: number) => {
    syncEnabledRef.current = true;
    setMessages(prev => prev.slice(0, upToIndex + 1));
    setContextInfo(null);
    setError(null);
  }, []);

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
