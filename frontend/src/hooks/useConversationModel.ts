import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { chatApi, type ContextBlock } from '../api.ts';
import { buildNextMainChatRequest } from '../components/chat/contextPreviewRequest.ts';
import { getEffectiveChatExecution } from '../components/chat/chatAgentUtils.ts';
import { effectiveChatModeIdForRequest } from '../components/chat/effectiveChatModeForRequest.ts';
import type { ChatMessage, Conversation, Mode, SelectionContext, ChatSessionKind } from '../types.ts';
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
  /** Same transcript as {@code chat.messages} — used so context preview matches the next {@link ChatRequest}. */
  messages: ChatMessage[];
  /**
   * Composer draft for context preview — lives in a ref so typing does not re-render the app.
   * Call {@link schedulePreviewRefresh} after updating this ref.
   */
  pendingMessageRef: RefObject<string>;
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
    messages,
    pendingMessageRef,
    chat,
    patchConversation,
    onActiveSelectionClear,
  } = p;

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const paramsRef = useRef({
    projectPath,
    conv,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    referencedFiles,
    focusedFieldKey,
    messages,
  });
  paramsRef.current = {
    projectPath,
    conv,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    referencedFiles,
    focusedFieldKey,
    messages,
  };

  const previewTimerRef = useRef(0);
  const previewFlightRef = useRef(0);

  const schedulePreviewRefresh = useCallback(() => {
    window.clearTimeout(previewTimerRef.current);
    const { projectPath: path } = paramsRef.current;
    if (!path) {
      previewFlightRef.current += 1;
      setSystemPrompt(null);
      return;
    }
    const flight = ++previewFlightRef.current;
    previewTimerRef.current = window.setTimeout(() => {
      const {
        conv: c,
        selectedMode: sm,
        modes: md,
        modeLlmId: mlid,
        useReasoning: ur,
        disabledToolkits: dt,
        referencedFiles: rf,
        focusedFieldKey: fk,
        messages: hist,
      } = paramsRef.current;
      const previewModeId = effectiveChatModeIdForRequest(c, sm, md);
      const exec = getEffectiveChatExecution(c, {
        llmId: mlid,
        useReasoning: ur,
        disabledToolkits: dt,
      });
      const req = buildNextMainChatRequest({
        previewModeId,
        exec,
        activeFieldKey: fk,
        referencedFiles: rf,
        conv: c,
        historyMessages: hist,
        pendingMessage: pendingMessageRef.current,
      });
      chatApi
        .previewContext(req)
        .then((res) => {
          if (flight !== previewFlightRef.current) return;
          setSystemPrompt(res.systemPrompt ?? null);
        })
        .catch(() => {
          if (flight !== previewFlightRef.current) return;
          setSystemPrompt(null);
        });
    }, PREVIEW_DEBOUNCE_MS);
  }, [pendingMessageRef]);

  useEffect(() => {
    schedulePreviewRefresh();
    return () => {
      window.clearTimeout(previewTimerRef.current);
      previewFlightRef.current += 1;
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
    messages,
    schedulePreviewRefresh,
  ]);

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
    const {
      conv: c,
      selectedMode: sm,
      modes: md,
      modeLlmId: mlid,
      useReasoning: ur,
      disabledToolkits: dt,
      referencedFiles: rf,
      focusedFieldKey: fk,
      messages: hist,
    } = paramsRef.current;
    const previewModeId = effectiveChatModeIdForRequest(c, sm, md);
    const exec = getEffectiveChatExecution(c, {
      llmId: mlid,
      useReasoning: ur,
      disabledToolkits: dt,
    });
    const result = await chatApi.previewContext(
      buildNextMainChatRequest({
        previewModeId,
        exec,
        activeFieldKey: fk,
        referencedFiles: rf,
        conv: c,
        historyMessages: hist,
        pendingMessage: pendingMessageRef.current,
      }),
    );
    return result.contextBlocks ?? [];
  }, [pendingMessageRef]);

  return {
    systemPrompt,
    send,
    editMessage,
    fetchContextBlocks,
    schedulePreviewRefresh,
    messages: chat.messages,
    streaming: chat.streaming,
    contextInfo: chat.contextInfo,
    error: chat.error,
    toolActivity: chat.toolActivity,
    stopStreaming: chat.stopStreaming,
    retry: chat.retry,
    forkFromMessage: chat.forkFromMessage,
    deleteMessages: chat.deleteMessages,
    loadMessages: chat.loadMessages,
  };
}
