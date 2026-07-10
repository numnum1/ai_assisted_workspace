import type { ChatRequest, ChatMessage } from '../../types.ts';
import { buildHistoryPayload } from '../../hooks/chatHistoryPayload.ts';

/**
 * Builds the same {@link ChatRequest} the main chat would send on the next turn:
 * same mode/exec fields as before, plus {@code history} from {@code buildHistoryPayload(historyMessages)}
 * and {@code message} as the composer draft (what the next request will carry as the user message).
 */
export function buildNextMainChatRequest(params: {
  previewModeId: string;
  exec: { useReasoning: boolean; llmId?: string; disabledToolkits: string[] };
  activeFieldKey: string | null | undefined;
  referencedFiles: string[];
  /** Current transcript; same as {@code useChat}'s messages when previewing the next send. */
  historyMessages: ChatMessage[];
  /**
   * Text that will appear in {@code ChatRequest.message} for the next send (composer draft).
   * Use empty string when only committed messages should shape the preview.
   */
  pendingMessage: string;
  rulesDisabled?: boolean;
}): ChatRequest {
  const {
    previewModeId,
    exec,
    activeFieldKey,
    referencedFiles,
    historyMessages,
    pendingMessage,
    rulesDisabled,
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
    ...(rulesDisabled ? { rulesDisabled: true } : {}),
  };
}
