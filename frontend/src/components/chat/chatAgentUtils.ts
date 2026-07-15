import type { ChatToolkitId, Conversation, LlmPublic, Mode } from '../../types.ts';
import type { NewChatConfirmPayload } from './NewChatDialog.tsx';

export function isNewChatConfirmPayload(x: unknown): x is NewChatConfirmPayload {
  return typeof x === 'object' && x !== null && 'sessionKind' in x && 'title' in x;
}

/** LLM/reasoning resolution aligned with the main chat mode switcher for a given mode id. */
export function executionPatchForMode(
  modeId: string,
  modes: readonly Mode[],
  llms: readonly LlmPublic[],
): Partial<Pick<Conversation, 'agentLlmId' | 'agentUseReasoning'>> {
  const m = modes.find((x) => x.id === modeId);
  if (!m) return {};
  const rawLlm = m.llmId?.trim();
  const llmId = rawLlm ? rawLlm : undefined;
  let agentUseReasoning = m.useReasoning ?? false;
  if (llmId) {
    const llm = llms.find((l) => l.id === llmId);
    if (llm) {
      const hasReasoning = !!llm.reasoningModel;
      const hasFast = !!llm.fastModel;
      if (!hasReasoning) {
        agentUseReasoning = false;
      } else if (!hasFast) {
        agentUseReasoning = true;
      }
    }
  }
  const patch: Partial<Pick<Conversation, 'agentLlmId' | 'agentUseReasoning'>> = {
    agentUseReasoning,
  };
  if (llmId) {
    patch.agentLlmId = llmId;
  }
  return patch;
}

/**
 * Conversation patch for a new Navi session: forces the configured mode + LLM
 * (from project settings) so the session doesn't inherit the toolbar mode.
 * Empty config fields fall back to the toolbar/default behavior.
 */
export function buildNaviConversationPatch(
  cfg: { modeId?: string | undefined; llmId?: string | undefined },
  modes: readonly Mode[],
  llms: readonly LlmPublic[],
): Partial<Conversation> {
  const patch: Partial<Conversation> = { naviStateId: 'greeting' };
  const modeId = cfg.modeId?.trim();
  if (modeId && modes.some((m) => m.id === modeId)) {
    patch.mode = modeId;
    Object.assign(patch, executionPatchForMode(modeId, modes, llms));
  }
  const llmId = cfg.llmId?.trim();
  if (llmId) {
    const llm = llms.find((l) => l.id === llmId);
    if (llm) {
      patch.agentLlmId = llmId;
      const hasReasoning = !!llm.reasoningModel;
      const hasFast = !!llm.fastModel;
      if (!hasReasoning) patch.agentUseReasoning = false;
      else if (!hasFast) patch.agentUseReasoning = true;
    }
  }
  return patch;
}

export interface EffectiveChatExecution {
  llmId: string | undefined;
  useReasoning: boolean;
  disabledToolkits: ChatToolkitId[];
}

/** Per-conversation agent overrides vs. global chat toolbar state. */
export function getEffectiveChatExecution(
  conv: Conversation | undefined,
  global: {
    llmId: string | undefined;
    useReasoning: boolean;
    disabledToolkits: ReadonlySet<string>;
  },
): EffectiveChatExecution {
  const llmId = conv?.agentLlmId !== undefined ? conv.agentLlmId : global.llmId;
  const useReasoning =
    conv?.agentUseReasoning !== undefined ? conv.agentUseReasoning : global.useReasoning;
  const disabledToolkits: ChatToolkitId[] =
    conv?.agentDisabledToolkits !== undefined
      ? [...conv.agentDisabledToolkits]
      : ([...global.disabledToolkits] as ChatToolkitId[]);
  return { llmId, useReasoning, disabledToolkits };
}
