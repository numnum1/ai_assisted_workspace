import type { Conversation, Mode } from '../../types.ts';

/** Matches user message label for prompt-pack mode in chat UI (see ChatPanel). */
export const PROMPT_PACK_DISPLAY_NAME = 'Prompt-Paket';

export function nonPromptModes(mds: Mode[]): Mode[] {
  return mds.filter((m) => m.id !== 'prompt-pack');
}

/**
 * Resolves mode id from persisted conversation (non–prompt-pack only).
 * Agent-only modes are kept for guided sessions; for standard chat they are ignored.
 */
export function resolvePersistedChatModeId(
  conv: Conversation,
  nonPrompt: Mode[],
  allModes: Mode[],
): string | null {
  const sessionKind = conv.sessionKind ?? 'standard';
  const allowed = (modeId: string): boolean => {
    const m = nonPrompt.find((x) => x.id === modeId);
    if (!m) return false;
    if (m.agentOnly && sessionKind !== 'guided') return false;
    return true;
  };
  if (conv.mode && conv.mode !== 'prompt-pack' && allowed(conv.mode)) return conv.mode;

  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.hidden || m.role !== 'user' || !m.mode) continue;
    if (m.mode === PROMPT_PACK_DISPLAY_NAME) continue;
    const found = allModes.find((mode) => mode.name === m.mode);
    if (found && found.id !== 'prompt-pack' && allowed(found.id)) return found.id;
  }
  return null;
}

/**
 * Outbound chat / preview requests: guided sessions use persisted {@link Conversation.mode}
 * (incl. agent-only presets), so an empty-tab toolbar sync cannot send the wrong mode id.
 */
export function effectiveChatModeIdForRequest(
  conv: Conversation | undefined,
  toolbarModeId: string,
  allModes: Mode[],
): string {
  if (!conv || (conv.sessionKind ?? 'standard') !== 'guided') return toolbarModeId;
  const nonPrompt = nonPromptModes(allModes);
  return resolvePersistedChatModeId(conv, nonPrompt, allModes) ?? toolbarModeId;
}
