import { useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  ChatRequest,
  MessageFeedback,
  ReasoningEffort,
  SelectionContext,
} from '../types.ts';
import { buildChatHistoryPayload } from '../services/ai/chatHistory.ts';
import { useAiStream } from './useAiStream.ts';

/** Params for API context when editing the last user message and re-streaming */
export interface EditMessageSendParams {
  mode: string;
  referencedFiles: string[];
  useReasoning?: boolean;
  reasoningEffort?: ReasoningEffort;
  llmId?: string;
  selectionContext?: SelectionContext;
  activeFieldKey?: string | null;
  /** Toolkit ids whose tools are omitted for this request. */
  disabledToolkits?: string[];
  conversationId: string;
  /** When true, project-level KI-Regeln are not injected into the system prompt. */
  rulesDisabled?: boolean;
}

/** Optional flags for {@link useChat}'s {@code sendMessage} (e.g. clarification answers). */
export interface SendMessageOptions {
  /** When true, the new user message is stored and sent to the API but not shown in the chat UI. */
  userHidden?: boolean;
  /** When set, the user message is a clarification multiple-choice answer — stored for rendering. */
  clarificationData?: {
    questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>;
    selected: Record<number, string[]>;
  };
  /** When true, project-level KI-Regeln are not injected into the system prompt. */
  rulesDisabled?: boolean;
  /** Effort hint for the reasoning model; only applied when reasoning is active. */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Main project chat. Builds the full {@link ChatRequest} (mode, references,
 * reasoning, toolkits, clarification) and layers message management — editing,
 * forking, deletion, feedback, and history persistence — on top of the shared
 * {@link useAiStream} streaming core.
 */
export function useChat(onMessagesChange?: (messages: ChatMessage[]) => void) {
  const stream = useAiStream();
  const {
    messages,
    setMessages,
    streaming,
    contextInfo,
    error,
    setError,
    toolActivity,
    setToolActivity,
    setContextInfo,
    currentBaseRef,
    messagesRef,
    startStream,
    stopStreaming,
    retry,
  } = stream;

  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
  }, [onMessagesChange]);

  // Skip syncing on initial mount and after loadMessages.
  const syncEnabledRef = useRef(false);

  // Sync messages to history whenever they change.
  useEffect(() => {
    if (!syncEnabledRef.current) return;
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const loadMessages = useCallback(
    (msgs: ChatMessage[]) => {
      syncEnabledRef.current = false;
      setMessages(msgs);
      setContextInfo(null);
      setError(null);
      setToolActivity(null);
      // Re-enable sync after React processes the state update.
      requestAnimationFrame(() => {
        syncEnabledRef.current = true;
      });
    },
    [setMessages, setContextInfo, setError, setToolActivity],
  );

  const sendMessage = useCallback(
    (
      text: string,
      mode: string,
      referencedFiles: string[],
      modeName?: string,
      modeColor?: string,
      useReasoning?: boolean,
      llmId?: string,
      selectionContext?: SelectionContext,
      activeFieldKey?: string | null,
      disabledToolkits?: string[],
      sendOpts?: SendMessageOptions,
    ) => {
      syncEnabledRef.current = true;
      const turnId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        turnId,
        mode: modeName,
        modeColor,
        ...(referencedFiles.length > 0 ? { attachedFiles: [...referencedFiles] } : {}),
        ...(sendOpts?.userHidden ? { hidden: true as const } : {}),
        ...(sendOpts?.clarificationData ? { clarificationData: sendOpts.clarificationData } : {}),
      };
      currentBaseRef.current = [...messagesRef.current, userMsg];
      setMessages(currentBaseRef.current);

      const request: ChatRequest = {
        message: text,
        activeFieldKey: activeFieldKey ?? null,
        mode,
        referencedFiles,
        history: buildChatHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: useReasoning ?? false,
        ...(sendOpts?.reasoningEffort ? { reasoningEffort: sendOpts.reasoningEffort } : {}),
        llmId: llmId,
        ...(disabledToolkits != null && disabledToolkits.length > 0
          ? { disabledToolkits: [...disabledToolkits] }
          : {}),
        ...(sendOpts?.rulesDisabled ? { rulesDisabled: true } : {}),
      };

      startStream(request, { selectionContext, turnId });
    },
    [currentBaseRef, messagesRef, setMessages, startStream],
  );

  const forkFromMessage = useCallback(
    (upToIndex: number) => {
      syncEnabledRef.current = true;
      setMessages((prev) => prev.slice(0, upToIndex + 1));
      setContextInfo(null);
      setError(null);
    },
    [setMessages, setContextInfo, setError],
  );

  const editMessage = useCallback(
    (index: number, newContent: string, sendParams: EditMessageSendParams) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const target = messagesRef.current[index];
      if (!target || target.role !== 'user' || target.hidden) return;

      const hasLaterVisibleUser = messagesRef.current
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
      const turnId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        turnId,
        mode: target.mode,
        modeColor: target.modeColor,
      };
      currentBaseRef.current = [...messagesRef.current.slice(0, index), userMsg];
      setMessages(currentBaseRef.current);

      const request: ChatRequest = {
        message: trimmed,
        activeFieldKey: sendParams.activeFieldKey ?? null,
        mode: sendParams.mode,
        referencedFiles: sendParams.referencedFiles,
        history: buildChatHistoryPayload(currentBaseRef.current.slice(0, -1)),
        useReasoning: sendParams.useReasoning ?? false,
        ...(sendParams.reasoningEffort ? { reasoningEffort: sendParams.reasoningEffort } : {}),
        llmId: sendParams.llmId,
        ...(sendParams.disabledToolkits != null && sendParams.disabledToolkits.length > 0
          ? { disabledToolkits: [...sendParams.disabledToolkits] }
          : {}),
        ...(sendParams.rulesDisabled ? { rulesDisabled: true } : {}),
      };

      startStream(request, {
        selectionContext: sendParams.selectionContext,
        turnId,
      });
    },
    [currentBaseRef, messagesRef, setMessages, startStream],
  );

  const deleteMessages = useCallback(
    (indices: number[]) => {
      if (indices.length === 0) return;
      const idxSet = new Set(indices);
      syncEnabledRef.current = true;
      setMessages((prev) => {
        const next = prev.filter((_, i) => !idxSet.has(i));
        currentBaseRef.current = next;
        return next;
      });
    },
    [currentBaseRef, setMessages],
  );

  const setMessageFeedback = useCallback(
    (index: number, feedback: MessageFeedback | null) => {
      syncEnabledRef.current = true;
      setMessages((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = prev.slice();
        const target = next[index];
        if (!target) return prev;
        if (feedback === null) {
          const without = { ...target };
          delete without.feedback;
          next[index] = without;
        } else {
          next[index] = { ...target, feedback };
        }
        currentBaseRef.current = next;
        return next;
      });
    },
    [currentBaseRef, setMessages],
  );

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
    deleteMessages,
    setMessageFeedback,
    loadMessages,
  };
}
