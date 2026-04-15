import type { AgentPreset, ChatToolkitId, Conversation } from '../../types.ts';
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

/** Guided session patch from a project agent preset (steering plan only from preset, if configured). */
export function buildGuidedAgentPatchFromPreset(preset: AgentPreset): Partial<Conversation> {
  const steeringPlan = preset.initialSteeringPlan?.trim();
  const patch: Partial<Conversation> = {
    mode: preset.modeId,
    agentPresetId: preset.id,
    agentPresetName: preset.name,
    agentUseReasoning: preset.useReasoning,
    agentDisabledToolkits: [...(preset.disabledToolkits ?? [])] as ChatToolkitId[],
    ...(steeringPlan ? { steeringPlan } : {}),
  };
  const lid = preset.llmId?.trim();
  if (lid) {
    patch.agentLlmId = lid;
  }
  return patch;
}

/** Copy guided template identity from parent (fork / thread). */
export function guidedPresetPartialFromParent(parent: Conversation): Partial<Conversation> {
  if (parent.sessionKind !== 'guided') return {};
  return {
    agentPresetId: parent.agentPresetId,
    agentPresetName: parent.agentPresetName,
  };
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
  const clearPreset =
    !p.agentPresetId?.trim() ? { agentPresetId: undefined, agentPresetName: undefined } : {};
  patchConversation(convId, {
    mode: selectedMode,
    ...buildAgentExecutionPatchFromGlobals(global),
    ...clearPreset,
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
