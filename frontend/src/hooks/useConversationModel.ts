import { useCallback, type RefObject } from 'react';
import { getEffectiveChatExecution } from '../components/chat/chatAgentUtils.ts';
import { effectiveChatModeIdForRequest } from '../components/chat/effectiveChatModeForRequest.ts';
import type { ChatMessage, Conversation, Mode, ReasoningEffort, SelectionContext, ChatSessionKind } from '../types.ts';
import { useChat } from './useChat.ts';

type UseChatInstance = ReturnType<typeof useChat>;

export interface UseConversationModelParams {
  activeConversation: Conversation | undefined;
  activeConversationId: string;
  selectedMode: string;
  modes: Mode[];
  modeLlmId: string | undefined;
  useReasoning: boolean;
  reasoningEffort: ReasoningEffort;
  disabledToolkits: ReadonlySet<string>;
  rulesDisabled: boolean;
  referencedFiles: string[];
  focusedFieldKey: string | null | undefined;
  activeSelection: SelectionContext | null;
  messages: ChatMessage[];
  pendingMessageRef: RefObject<string>;
  chat: UseChatInstance;
  patchConversation: (id: string, patch: Partial<Conversation>) => void;
  onActiveSelectionClear: () => void;
  clearReferencedFiles: () => void;
}

/**
 * Runtime “conversation” model: {@link send} / {@link editMessage} build the next
 * {@link ChatRequest} from the current mode/execution settings and delegate to {@link useChat}.
 */
export function useConversationModel(p: UseConversationModelParams) {
  const {
    activeConversation: conv,
    activeConversationId,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    reasoningEffort,
    disabledToolkits,
    rulesDisabled,
    referencedFiles,
    focusedFieldKey,
    activeSelection,
    chat,
    patchConversation,
    onActiveSelectionClear,
    clearReferencedFiles,
  } = p;

  const send = useCallback(
    (message: string, clarificationData?: { questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>; selected: Record<number, string[]> }) => {
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
        sessionKind: (c?.sessionKind ?? 'navi') as ChatSessionKind,
        isThread: c?.isThread ?? false,
        naviStateId: c?.naviStateId ?? null,
        ...(c?.naviFacts ? { naviFacts: c.naviFacts } : {}),
        ...(c?.naviCoveredTips?.length ? { naviCoveredTips: c.naviCoveredTips } : {}),
        ...(c?.simulationConfig ? { simulationConfig: c.simulationConfig } : {}),
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
        {
          ...(clarificationData != null ? { clarificationData } : {}),
          ...(rulesDisabled ? { rulesDisabled: true } : {}),
          ...(exec.useReasoning ? { reasoningEffort } : {}),
        },
      );
      patchConversation(activeConversationId, { mode: modeId });
      onActiveSelectionClear();
      clearReferencedFiles();
    },
    [
      conv,
      selectedMode,
      modes,
      modeLlmId,
      useReasoning,
      reasoningEffort,
      disabledToolkits,
      referencedFiles,
      activeSelection,
      focusedFieldKey,
      chat,
      activeConversationId,
      patchConversation,
      onActiveSelectionClear,
      clearReferencedFiles,
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
        ...(exec.useReasoning ? { reasoningEffort } : {}),
        llmId: exec.llmId,
        selectionContext: activeSelection ?? undefined,
        activeFieldKey: focusedFieldKey ?? null,
        disabledToolkits: exec.disabledToolkits,
        conversationId: c?.id ?? activeConversationId,
        sessionKind: (c?.sessionKind ?? 'navi') as ChatSessionKind,
        isThread: c?.isThread ?? false,
        rulesDisabled,
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
      reasoningEffort,
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

  return {
    send,
    editMessage,
    messages: chat.messages,
    streaming: chat.streaming,
    contextInfo: chat.contextInfo,
    error: chat.error,
    toolActivity: chat.toolActivity,
    stopStreaming: chat.stopStreaming,
    retry: chat.retry,
    forkFromMessage: chat.forkFromMessage,
    deleteMessages: chat.deleteMessages,
    setMessageFeedback: chat.setMessageFeedback,
    loadMessages: chat.loadMessages,
  };
}
