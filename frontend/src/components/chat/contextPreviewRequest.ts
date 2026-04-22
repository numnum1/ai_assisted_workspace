import type { ChatRequest, Conversation } from '../../types.ts';
import type { EffectiveChatExecution } from './chatAgentUtils.ts';

/**
 * Builds the same {@link ChatRequest} shape used for {@code POST /chat/context-preview}
 * as for the next main-chat send (empty message, no history) — single place for preview vs. inspector fetch.
 * Does not include any implicit “current file” injection; only {@code referencedFiles} and configured always-include files supply file context.
 */
export function buildMainChatContextPreviewRequest(params: {
  previewModeId: string;
  exec: EffectiveChatExecution;
  activeFieldKey: string | null | undefined;
  referencedFiles: string[];
  conv: Conversation | undefined;
}): ChatRequest {
  const { previewModeId, exec, activeFieldKey, referencedFiles, conv } = params;
  return {
    message: '',
    activeFieldKey: activeFieldKey ?? null,
    mode: previewModeId,
    referencedFiles,
    history: [],
    useReasoning: exec.useReasoning,
    llmId: exec.llmId,
    disabledToolkits: exec.disabledToolkits,
    sessionKind: conv?.sessionKind ?? 'standard',
    steeringPlan: conv?.sessionKind === 'guided' ? conv.steeringPlan ?? null : undefined,
  };
}
