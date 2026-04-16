import type { AgentPreset, ChatToolkitId, Conversation, LlmPublic } from '../../types.ts';
import type { NewChatConfirmPayload } from './NewChatDialog.tsx';

export function isNewChatConfirmPayload(x: unknown): x is NewChatConfirmPayload {
  return typeof x === 'object' && x !== null && 'sessionKind' in x && 'title' in x;
}

/** True when the conversation has any persisted agent execution binding. */
export function conversationHasAgentExecution(conv: Conversation | undefined): boolean {
  if (!conv) return false;
  return (
    conv.agentLlmId !== undefined ||
    conv.agentUseReasoning !== undefined ||
    conv.agentDisabledToolkits !== undefined
  );
}

export function buildAgentExecutionPatchFromGlobals(global: {
  llmId: string | undefined;
  useReasoning: boolean;
  disabledToolkits: ReadonlySet<string>;
}): Pick<Conversation, 'agentLlmId' | 'agentUseReasoning' | 'agentDisabledToolkits'> {
  return {
    agentLlmId: global.llmId,
    agentUseReasoning: global.useReasoning,
    agentDisabledToolkits: [...global.disabledToolkits] as ChatToolkitId[],
  };
}

/** Copy only defined agent fields from parent (fork/thread). */
export function agentExecutionPartialFromParent(parent: Conversation): Partial<Conversation> {
  if (!conversationHasAgentExecution(parent)) return {};
  const out: Partial<Conversation> = {};
  if (parent.agentLlmId !== undefined) out.agentLlmId = parent.agentLlmId;
  if (parent.agentUseReasoning !== undefined) out.agentUseReasoning = parent.agentUseReasoning;
  if (parent.agentDisabledToolkits !== undefined) {
    out.agentDisabledToolkits = [...parent.agentDisabledToolkits];
  }
  return out;
}

/**
 * When a thread/fork is created under a chat that uses {@link AgentPreset}, optional {@link AgentPreset.threadLlmId}
 * overrides inherited {@link Conversation.agentLlmId} and may adjust {@link Conversation.agentUseReasoning} from model caps.
 */
export function threadExecutionOverrideFromPreset(
  preset: AgentPreset | undefined,
  llms: readonly LlmPublic[],
): Partial<Pick<Conversation, 'agentLlmId' | 'agentUseReasoning'>> {
  const raw = preset?.threadLlmId?.trim();
  if (!raw) return {};
  const lp = llms.find((l) => l.id === raw);
  const hasReasoning = !!lp?.reasoningModel;
  const hasFast = !!lp?.fastModel;
  const patch: Partial<Pick<Conversation, 'agentLlmId' | 'agentUseReasoning'>> = {
    agentLlmId: raw,
  };
  if (!hasReasoning) {
    patch.agentUseReasoning = false;
  } else if (!hasFast) {
    patch.agentUseReasoning = true;
  }
  return patch;
}

/** Copy agent preset id from parent for guided fork/thread children (for {@link AgentPreset.threadLlmId} resolution). */
export function guidedPresetPartialFromParent(parent: Conversation): Partial<Conversation> {
  const id = parent.agentPresetId?.trim();
  if (!id) return {};
  return { agentPresetId: id };
}

/** Guided session patch from a project agent preset (optional dialog plan overrides preset default). */
export function buildGuidedAgentPatchFromPreset(
  preset: AgentPreset,
  dialogInitialPlan?: string | undefined,
  agentPresetId?: string | undefined,
): Partial<Conversation> {
  const dialog = dialogInitialPlan?.trim();
  const fallback = preset.initialSteeringPlan?.trim();
  const steeringPlan = dialog || fallback;
  const presetId = agentPresetId?.trim();
  const patch: Partial<Conversation> = {
    mode: preset.modeId,
    agentUseReasoning: preset.useReasoning,
    agentDisabledToolkits: [...(preset.disabledToolkits ?? [])] as ChatToolkitId[],
    ...(steeringPlan ? { steeringPlan } : {}),
    ...(presetId ? { agentPresetId: presetId } : {}),
  };
  const lid = preset.llmId?.trim();
  if (lid) {
    patch.agentLlmId = lid;
  }
  return patch;
}

export function applyGuidedAgentFromNewChatDialog(
  convId: string,
  p: NewChatConfirmPayload,
  selectedMode: string,
  global: {
    llmId: string | undefined;
    useReasoning: boolean;
    disabledToolkits: ReadonlySet<string>;
  },
  patchConversation: (id: string, patch: Partial<Conversation>) => void,
): void {
  if (p.sessionKind !== 'guided') return;
  const plan = p.initialSteeringPlan?.trim();
  patchConversation(convId, {
    mode: selectedMode,
    ...buildAgentExecutionPatchFromGlobals(global),
    ...(plan ? { steeringPlan: plan } : {}),
  });
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
