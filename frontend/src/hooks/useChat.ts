import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ChatRequest,
  ChatSessionKind,
  ContextInfo,
  SelectionContext,
} from '../types.ts';
import { attachAssistantStream, type StreamCallbacks } from './assistantStream.ts';

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
  /** Toolkit ids whose tools are omitted for this request. */
  disabledToolkits?: string[];
  conversationId: string;
  sessionKind: ChatSessionKind;
  steeringPlan?: string;
}

/** Active conversation id + session kind; sent with each chat request for guided mode / plan persistence. */
export interface ChatStreamSessionMeta {
  conversationId: string;
  sessionKind: ChatSessionKind;
  steeringPlan?: string;
}

/** Optional flags for {@link useChat}'s {@code sendMessage} (e.g. guided preset bootstrap). */
export interface SendMessageOptions {
  /** When true, the new user message is stored and sent to the API but not shown in the chat UI. */
  userHidden?: boolean;
}

function buildHistoryPayload(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
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

export interface UseChatOptions {
  onAssistantResponseComplete?: (
    fullText: string,
    meta: { conversationId: string; sessionKind: ChatSessionKind },
  ) => void;
}

function buildSessionChatRequestFields(meta: ChatStreamSessionMeta | undefined): Partial<ChatRequest> {
  if (!meta) {
    return { sessionKind: 'standard' };
  }
  const sk = meta.sessionKind ?? 'standard';
  if (sk === 'guided') {
    return {
      sessionKind: 'guided',
      steeringPlan: meta.steeringPlan ?? null,
    };
  }
  return { sessionKind: 'standard' };
}

export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void, options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastStreamCallRef = useRef<{
    chatRequest: ChatRequest;
    selectionContext?: SelectionContext;
    streamMeta?: { conversationId: string; sessionKind: ChatSessionKind };
  } | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const onAssistantResponseCompleteRef = useRef(options?.onAssistantResponseComplete);
  onAssistantResponseCompleteRef.current = options?.onAssistantResponseComplete;

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
      disabledToolkits?: string[],
      streamSession?: ChatStreamSessionMeta,
      sendOpts?: SendMessageOptions,
    ) => {
      syncEnabledRef.current = true;
      setError(null);
      setToolActivity(null);
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        mode: modeName,
        modeColor,
        ...(sendOpts?.userHidden ? { hidden: true as const } : {}),
      };
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

      const streamMeta =
        streamSession != null
          ? { conversationId: streamSession.conversationId, sessionKind: streamSession.sessionKind }
          : undefined;

      const request: ChatRequest = {
        message: text,
        activeFile,
        activeFieldKey: activeFieldKey ?? null,
        mode,
        referencedFiles,
        history: buildHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: useReasoning ?? false,
        llmId: llmId,
        ...(disabledToolkits != null && disabledToolkits.length > 0
          ? { disabledToolkits: [...disabledToolkits] }
          : {}),
        ...buildSessionChatRequestFields(streamSession),
      };
      lastStreamCallRef.current = { chatRequest: request, selectionContext, streamMeta };

      const onComplete =
        streamMeta && onAssistantResponseCompleteRef.current
          ? (fullText: string) =>
              onAssistantResponseCompleteRef.current?.(fullText, streamMeta)
          : undefined;

      abortRef.current = attachAssistantStream(request, selectionContext, streamCbs, onComplete);
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
    const { chatRequest, selectionContext, streamMeta } = last;
    const onComplete =
      streamMeta && onAssistantResponseCompleteRef.current
        ? (fullText: string) => onAssistantResponseCompleteRef.current?.(fullText, streamMeta)
        : undefined;
    const streamCbs = {
      setMessages,
      setStreaming,
      setError,
      setToolActivity,
      setContextInfo,
      currentBaseRef,
    };
    abortRef.current = attachAssistantStream(chatRequest, selectionContext, streamCbs, onComplete);
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

      const streamMeta = {
        conversationId: sendParams.conversationId,
        sessionKind: sendParams.sessionKind,
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
        ...(sendParams.disabledToolkits != null && sendParams.disabledToolkits.length > 0
          ? { disabledToolkits: [...sendParams.disabledToolkits] }
          : {}),
        ...buildSessionChatRequestFields({
          conversationId: sendParams.conversationId,
          sessionKind: sendParams.sessionKind,
          steeringPlan: sendParams.steeringPlan,
        }),
      };

      const onComplete =
        onAssistantResponseCompleteRef.current != null
          ? (fullText: string) =>
              onAssistantResponseCompleteRef.current?.(fullText, streamMeta)
          : undefined;

      lastStreamCallRef.current = {
        chatRequest: request,
        selectionContext: sendParams.selectionContext,
        streamMeta,
      };

      abortRef.current = attachAssistantStream(
        request,
        sendParams.selectionContext,
        streamCbs,
        onComplete,
      );
    },
    [messages],
  );

  const deleteMessage = useCallback((originalIdx: number) => {
    syncEnabledRef.current = true;
    setMessages(prev => {
      const next = prev.filter((_, i) => i !== originalIdx);
      currentBaseRef.current = next;
      return next;
    });
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
    editMessage,
    deleteMessage,
    loadMessages,
  };
}
