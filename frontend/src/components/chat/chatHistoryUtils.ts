import type { Conversation } from '../../types.ts';

export function buildConversationById(conversations: Conversation[]): Map<string, Conversation> {
  return new Map(conversations.map((c) => [c.id, c]));
}

/**
 * Project sync follows the root chat's pin. Threads inherit from their parent chain;
 * orphans (missing parent) are never effectively pinned.
 */
export function effectiveSavedToProject(
  conv: Conversation,
  byId: Map<string, Conversation>,
): boolean {
  if (conv.isThread && conv.parentConversationId) {
    const parent = byId.get(conv.parentConversationId);
    if (!parent) return false;
    return effectiveSavedToProject(parent, byId);
  }
  return conv.savedToProject === true;
}

/** Root id for the thread branch: parent when active is a thread, else active id. */
export function resolveThreadBranchRootId(active: Conversation | undefined): string | null {
  if (!active) return null;
  if (active.isThread && active.parentConversationId) {
    return active.parentConversationId;
  }
  return active.id;
}

export function listThreadsForRoot(conversations: Conversation[], rootId: string): Conversation[] {
  const list = conversations.filter(
    (c) => Boolean(c.isThread && c.parentConversationId === rootId),
  );
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}
