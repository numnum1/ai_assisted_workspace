import type { Conversation, Mode } from '../../types.ts';

/** Modes shown in the main chat mode menu (excludes agent-only presets). */
export function standardChatModes(mds: Mode[]): Mode[] {
  return mds.filter((m) => !m.agentOnly);
}

export function resolveDefaultModeId(
  mds: Mode[],
  configured: string | undefined,
): string {
  const id = configured?.trim() ?? "";
  if (id && mds.some((m) => m.id === id)) return id;
  if (mds.some((m) => m.id === "review")) return "review";
  if (mds.length > 0) return mds[0].id;
  return "review";
}

/**
 * Resolves mode id from persisted conversation.
 * Agent-only modes are kept for guided sessions; for standard chat they are ignored.
 */
export function resolvePersistedChatModeId(
  conv: Conversation,
  allModes: Mode[],
): string | null {
  const sessionKind = conv.sessionKind ?? 'standard';
  const allowed = (modeId: string): boolean => {
    const m = allModes.find((x) => x.id === modeId);
    if (!m) return false;
    if (m.agentOnly && sessionKind !== 'guided' && sessionKind !== 'navi') return false;
    return true;
  };
  if (conv.mode && allowed(conv.mode)) return conv.mode;

  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.hidden || m.role !== 'user' || !m.mode) continue;
    const found = allModes.find((mode) => mode.name === m.mode);
    if (found && allowed(found.id)) return found.id;
  }
  return null;
}

/**
 * Outbound chat / preview requests: guided and navi sessions use persisted {@link Conversation.mode}
 * (incl. agent-only presets), so an empty-tab toolbar sync cannot send the wrong mode id.
 */
export function effectiveChatModeIdForRequest(
  conv: Conversation | undefined,
  toolbarModeId: string,
  allModes: Mode[],
): string {
  const sessionKind = conv?.sessionKind ?? 'standard';
  if (!conv || (sessionKind !== 'guided' && sessionKind !== 'navi')) return toolbarModeId;
  return resolvePersistedChatModeId(conv, allModes) ?? toolbarModeId;
}
