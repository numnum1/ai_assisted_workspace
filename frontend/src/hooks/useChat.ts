import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ChatRequest, ContextInfo, SelectionContext } from '../types.ts';
import { streamChat } from '../api.ts';

/**
 * Transforms the messages array into the history payload sent to the backend.
 * - User messages: uses resolvedContent (with file data) if available, strips UI-only fields
 * - Tool/hidden messages: passes through role, content, toolCalls, toolCallId
 * - Assistant messages: passes through role and content (and selectionContext stripped)
 */
function buildHistoryPayload(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.resolvedContent ?? msg.content,
        ...(msg.mode !== undefined && { mode: msg.mode }),
        ...(msg.modeColor !== undefined && { modeColor: msg.modeColor }),
      };
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

export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastStreamCallRef = useRef<{ chatRequest: ChatRequest; selectionContext?: SelectionContext } | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Tracks the evolving base message list during an active stream so that
  // callbacks (onToolHistory, onResolvedUserMessage) can mutate it without
  // stale closure issues.
  const currentBaseRef = useRef<ChatMessage[]>([]);

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
      currentBaseRef.current = [...messages, userMsg];
      setMessages(currentBaseRef.current);
      setStreaming(true);

      let assistantContent = '';

      const chatRequest: ChatRequest = {
        message: text,
        activeFile,
        activeFieldKey: activeFieldKey ?? null,
        mode,
        referencedFiles,
        history: buildHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: useReasoning ?? false,
        llmId: llmId,
      };
      lastStreamCallRef.current = { chatRequest, selectionContext };

      const controller = streamChat(
        chatRequest,
        (token) => {
          assistantContent += token;
          setMessages([
            ...currentBaseRef.current,
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
        (updatedTokens) => {
          setContextInfo(prev =>
            prev ? { ...prev, estimatedTokens: updatedTokens } : prev
          );
        },
        (toolMessages) => {
          // Append hidden tool-chain messages into the base so subsequent turns include them
          currentBaseRef.current = [
            ...currentBaseRef.current,
            ...toolMessages.map((m) => ({ ...m, hidden: true })),
          ];
          setMessages(currentBaseRef.current);
        },
        (resolved) => {
          // Replace the user message's content with the expanded version (file contents included)
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
    },
    [messages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const retry = useCallback(() => {
    const last = lastStreamCallRef.current;
    if (!last) return;
    setError(null);
    setStreaming(true);
    setToolActivity(null);
    let assistantContent = '';
    const { chatRequest, selectionContext } = last;
    const controller = streamChat(
      chatRequest,
      (token) => {
        assistantContent += token;
        setMessages([
          ...currentBaseRef.current,
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
      (updatedTokens) => {
        setContextInfo(prev =>
          prev ? { ...prev, estimatedTokens: updatedTokens } : prev
        );
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
    retry,
    forkFromMessage,
    loadMessages,
  };
}
