import type { Conversation, Mode } from '../../types.ts';

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

/** Resolves mode id from persisted conversation: current mode id, else last user message's mode name. */
export function resolvePersistedChatModeId(
  conv: Conversation,
  allModes: Mode[],
): string | null {
  const allowed = (modeId: string): boolean => allModes.some((x) => x.id === modeId);
  if (conv.mode && allowed(conv.mode)) return conv.mode;

  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.hidden || m.role !== 'user' || !m.mode) continue;
    const found = allModes.find((mode) => mode.name === m.mode);
    if (found && allowed(found.id)) return found.id;
  }
  return null;
}
