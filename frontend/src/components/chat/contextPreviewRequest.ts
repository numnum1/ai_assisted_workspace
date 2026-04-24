import type { ChatRequest, Conversation, ChatMessage } from '../../types.ts';
import type { EffectiveChatExecution } from './chatAgentUtils.ts';
import { buildHistoryPayload } from '../../hooks/chatHistoryPayload.ts';

/**
 * Builds the same {@link ChatRequest} the main chat would send on the next turn:
 * same session/mode/exec fields as before, plus {@code history} from {@code buildHistoryPayload(historyMessages)}
 * and {@code message} as the composer draft (what the next request will carry as the user message).
 */
export function buildNextMainChatRequest(params: {
  previewModeId: string;
  exec: EffectiveChatExecution;
  activeFieldKey: string | null | undefined;
  referencedFiles: string[];
  conv: Conversation | undefined;
  /** Current transcript; same as {@code useChat}'s messages when previewing the next send. */
  historyMessages: ChatMessage[];
  /**
   * Text that will appear in {@code ChatRequest.message} for the next send (composer draft).
   * Use empty string when only committed messages should shape the preview.
   */
  pendingMessage: string;
}): ChatRequest {
  const {
    previewModeId,
    exec,
    activeFieldKey,
    referencedFiles,
    conv,
    historyMessages,
    pendingMessage,
  } = params;
  return {
    message: pendingMessage,
    activeFieldKey: activeFieldKey ?? null,
    mode: previewModeId,
    referencedFiles,
    history: buildHistoryPayload(historyMessages),
    useReasoning: exec.useReasoning,
    llmId: exec.llmId,
    disabledToolkits: exec.disabledToolkits,
    sessionKind: conv?.sessionKind ?? 'standard',
    steeringPlan: conv?.sessionKind === 'guided' ? conv.steeringPlan ?? null : undefined,
  };
}
