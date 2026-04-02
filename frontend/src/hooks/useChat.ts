import { useState, useCallback, useRef, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage, ChatRequest, ContextInfo, SelectionContext } from '../types.ts';
import { streamChat } from '../api.ts';

/**
 * Transforms the messages array into the history payload sent to the backend.
 * - User messages: uses resolvedContent (with file data) if available, strips UI-only fields
 * - Tool/hidden messages: passes through role, content, toolCalls, toolCallId
 * - Assistant messages: passes through role and content (and selectionContext stripped)
 */
/** Params for API context when editing the last user message and re-streaming */
export interface EditMessageSendParams {
  activeFile: string | null;
  mode: string;
  referencedFiles: string[];
  useReasoning?: boolean;
  llmId?: string;
  selectionContext?: SelectionContext;
  activeFieldKey?: string | null;
}

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

type StreamCallbacks = {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStreaming: (v: boolean) => void;
  setError: (v: string | null) => void;
  setToolActivity: (v: string | null) => void;
  setContextInfo: Dispatch<SetStateAction<ContextInfo | null>>;
  currentBaseRef: MutableRefObject<ChatMessage[]>;
};

function attachAssistantStream(
  requestBase: ChatRequest,
  selectionContext: SelectionContext | undefined,
  cbs: StreamCallbacks,
): AbortController {
  let assistantContent = '';

  return streamChat(
    requestBase,
    (token) => {
      assistantContent += token;
      cbs.setMessages([
        ...cbs.currentBaseRef.current,
        { role: 'assistant', content: assistantContent, selectionContext },
      ]);
      cbs.setToolActivity(null);
    },
    (info) => {
      cbs.setContextInfo(info);
    },
    () => {
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
    },
    (err) => {
      cbs.setError(err.message);
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
    },
    (description) => {
      cbs.setToolActivity(description);
    },
    (updatedTokens) => {
      cbs.setContextInfo((prev) =>
        prev ? { ...prev, estimatedTokens: updatedTokens } : prev,
      );
    },
    (toolMessages) => {
      cbs.currentBaseRef.current = [
        ...cbs.currentBaseRef.current,
        ...toolMessages.map((m) => ({ ...m, hidden: true })),
      ];
      cbs.setMessages(cbs.currentBaseRef.current);
    },
    (resolved) => {
      const base = [...cbs.currentBaseRef.current];
      for (let i = base.length - 1; i >= 0; i--) {
        if (base[i].role === 'user' && !base[i].hidden) {
          base[i] = { ...base[i], resolvedContent: resolved };
          break;
        }
      }
      cbs.currentBaseRef.current = base;
      cbs.setMessages(base);
    },
  );
}

export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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

      const streamCbs: StreamCallbacks = {
        setMessages,
        setStreaming,
        setError,
        setToolActivity,
        setContextInfo,
        currentBaseRef,
      };

      const request: ChatRequest = {
        message: text,
        activeFile,
        activeFieldKey: activeFieldKey ?? null,
        mode,
        referencedFiles,
        history: buildHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: useReasoning ?? false,
        llmId: llmId,
      };

      abortRef.current = attachAssistantStream(request, selectionContext, streamCbs);
    },
    [messages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  const forkFromMessage = useCallback((upToIndex: number) => {
    syncEnabledRef.current = true;
    setMessages(prev => prev.slice(0, upToIndex + 1));
    setContextInfo(null);
    setError(null);
  }, []);

  const editMessage = useCallback(
    (index: number, newContent: string, sendParams: EditMessageSendParams) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const target = messages[index];
      if (!target || target.role !== 'user' || target.hidden) return;

      const hasLaterVisibleUser = messages
        .slice(index + 1)
        .some((m) => m.role === 'user' && !m.hidden);

      if (hasLaterVisibleUser) {
        syncEnabledRef.current = true;
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index ? { ...m, content: trimmed, resolvedContent: undefined } : m,
          ),
        );
        return;
      }

      syncEnabledRef.current = true;
      setError(null);
      setToolActivity(null);
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        mode: target.mode,
        modeColor: target.modeColor,
      };
      currentBaseRef.current = [...messages.slice(0, index), userMsg];
      setMessages(currentBaseRef.current);
      setStreaming(true);

      const streamCbs: StreamCallbacks = {
        setMessages,
        setStreaming,
        setError,
        setToolActivity,
        setContextInfo,
        currentBaseRef,
      };

      const request: ChatRequest = {
        message: trimmed,
        activeFile: sendParams.activeFile,
        activeFieldKey: sendParams.activeFieldKey ?? null,
        mode: sendParams.mode,
        referencedFiles: sendParams.referencedFiles,
        history: buildHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: sendParams.useReasoning ?? false,
        llmId: sendParams.llmId,
      };

      abortRef.current = attachAssistantStream(
        request,
        sendParams.selectionContext,
        streamCbs,
      );
    },
    [messages],
  );

  return {
    messages,
    streaming,
    contextInfo,
    error,
    toolActivity,
    sendMessage,
    stopStreaming,
    forkFromMessage,
    editMessage,
    loadMessages,
  };
}
