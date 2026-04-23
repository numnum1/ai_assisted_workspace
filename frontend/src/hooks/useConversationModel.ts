import { useCallback, useEffect, useState } from 'react';
import { chatApi, type ContextBlock } from '../api.ts';
import { buildMainChatContextPreviewRequest } from '../components/chat/contextPreviewRequest.ts';
import { getEffectiveChatExecution } from '../components/chat/chatAgentUtils.ts';
import { effectiveChatModeIdForRequest } from '../components/chat/effectiveChatModeForRequest.ts';
import type { Conversation, Mode, SelectionContext, ChatSessionKind } from '../types.ts';
import { useChat } from './useChat.ts';

type UseChatInstance = ReturnType<typeof useChat>;

export interface UseConversationModelParams {
  projectPath: string | null;
  activeConversation: Conversation | undefined;
  activeConversationId: string;
  selectedMode: string;
  modes: Mode[];
  modeLlmId: string | undefined;
  useReasoning: boolean;
  disabledToolkits: ReadonlySet<string>;
  referencedFiles: string[];
  focusedFieldKey: string | null | undefined;
  activeSelection: SelectionContext | null;
  chat: UseChatInstance;
  patchConversation: (id: string, patch: Partial<Conversation>) => void;
  onActiveSelectionClear: () => void;
}

const PREVIEW_DEBOUNCE_MS = 300;

/**
 * Runtime “conversation” model: reactive {@link systemPrompt} for the next main-chat request
 * and {@link send} / {@link editMessage} aligned with the same request shape.
 * Does not replace {@link useChat} — composes it.
 */
export function useConversationModel(p: UseConversationModelParams) {
  const {
    projectPath,
    activeConversation: conv,
    activeConversationId,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    referencedFiles,
    focusedFieldKey,
    activeSelection,
    chat,
    patchConversation,
    onActiveSelectionClear,
  } = p;

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const send = useCallback(
    (message: string) => {
      const c = conv;
      const modeId = effectiveChatModeIdForRequest(c, selectedMode, modes);
      const mode = modes.find((m) => m.id === modeId);
      const exec = getEffectiveChatExecution(c, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      const streamSession = {
        conversationId: c?.id ?? activeConversationId,
        sessionKind: (c?.sessionKind ?? 'standard') as ChatSessionKind,
        steeringPlan: c?.steeringPlan,
      };
      chat.sendMessage(
        message,
        modeId,
        referencedFiles,
        mode?.name,
        mode?.color,
        exec.useReasoning,
        exec.llmId,
        activeSelection ?? undefined,
        focusedFieldKey ?? null,
        exec.disabledToolkits,
        streamSession,
        undefined,
      );
      patchConversation(activeConversationId, { mode: modeId });
      onActiveSelectionClear();
    },
    [
      conv,
      selectedMode,
      modes,
      modeLlmId,
      useReasoning,
      disabledToolkits,
      referencedFiles,
      activeSelection,
      focusedFieldKey,
      chat,
      activeConversationId,
      patchConversation,
      onActiveSelectionClear,
    ],
  );

  const editMessage = useCallback(
    (index: number, newContent: string) => {
      const c = conv;
      const modeId = effectiveChatModeIdForRequest(c, selectedMode, modes);
      const exec = getEffectiveChatExecution(c, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      chat.editMessage(index, newContent, {
        mode: modeId,
        referencedFiles,
        useReasoning: exec.useReasoning,
        llmId: exec.llmId,
        selectionContext: activeSelection ?? undefined,
        activeFieldKey: focusedFieldKey ?? null,
        disabledToolkits: exec.disabledToolkits,
        conversationId: c?.id ?? activeConversationId,
        sessionKind: (c?.sessionKind ?? 'standard') as ChatSessionKind,
        steeringPlan: c?.steeringPlan,
      });
      patchConversation(activeConversationId, { mode: modeId });
      onActiveSelectionClear();
    },
    [
      conv,
      selectedMode,
      modes,
      modeLlmId,
      useReasoning,
      disabledToolkits,
      referencedFiles,
      activeSelection,
      focusedFieldKey,
      chat,
      activeConversationId,
      patchConversation,
      onActiveSelectionClear,
    ],
  );

  const fetchContextBlocks = useCallback(async (): Promise<ContextBlock[]> => {
    const previewModeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
    const exec = getEffectiveChatExecution(conv, {
      llmId: modeLlmId,
      useReasoning,
      disabledToolkits,
    });
    const result = await chatApi.previewContext(
      buildMainChatContextPreviewRequest({
        previewModeId,
        exec,
        activeFieldKey: focusedFieldKey,
        referencedFiles,
        conv,
      }),
    );
    return result.contextBlocks ?? [];
  }, [
    conv,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    referencedFiles,
    focusedFieldKey,
  ]);

  useEffect(() => {
    if (!projectPath) {
      setSystemPrompt(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const previewModeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      const req = buildMainChatContextPreviewRequest({
        previewModeId,
        exec,
        activeFieldKey: focusedFieldKey,
        referencedFiles,
        conv,
      });
      chatApi
        .previewContext(req)
        .then((res) => {
          if (!cancelled) setSystemPrompt(res.systemPrompt ?? null);
        })
        .catch(() => {
          if (!cancelled) setSystemPrompt(null);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    projectPath,
    conv,
    selectedMode,
    modes,
    referencedFiles,
    useReasoning,
    modeLlmId,
    focusedFieldKey,
    disabledToolkits,
  ]);

  return {
    systemPrompt,
    send,
    editMessage,
    fetchContextBlocks,
    messages: chat.messages,
    streaming: chat.streaming,
    contextInfo: chat.contextInfo,
    error: chat.error,
    toolActivity: chat.toolActivity,
    stopStreaming: chat.stopStreaming,
    retry: chat.retry,
    forkFromMessage: chat.forkFromMessage,
    deleteMessage: chat.deleteMessage,
    loadMessages: chat.loadMessages,
  };
}
