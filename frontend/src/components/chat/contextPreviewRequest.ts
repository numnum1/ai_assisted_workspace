import type { ChatRequest, Conversation } from '../../types.ts';
import type { EffectiveChatExecution } from './chatAgentUtils.ts';

/**
 * Builds the same {@link ChatRequest} shape used for {@code POST /chat/context-preview}
 * as for the next main-chat send (empty message, no history) — single place for preview vs. inspector fetch.
 */
export function buildMainChatContextPreviewRequest(params: {
  previewModeId: string;
  exec: EffectiveChatExecution;
  activeFile: string | null;
  activeFieldKey: string | null | undefined;
  referencedFiles: string[];
  conv: Conversation | undefined;
}): ChatRequest {
  const { previewModeId, exec, activeFile, activeFieldKey, referencedFiles, conv } = params;
  return {
    message: '',
    activeFile,
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
