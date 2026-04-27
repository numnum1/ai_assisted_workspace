import type { Conversation } from "../../types.ts";

export function buildConversationById(
  conversations: Conversation[],
): Map<string, Conversation> {
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

/**
 * Walk the parent chain of `active` upward until we reach a conversation that
 * is not itself a thread (i.e. the true root of the branch tree).
 *
 * Requires `byId` so the full chain can be resolved for arbitrarily deep
 * thread-of-thread hierarchies.  A visited-set guards against cycles in
 * corrupted data.
 */
export function resolveThreadBranchRootId(
  active: Conversation | undefined,
  byId: Map<string, Conversation>,
): string | null {
  if (!active) return null;

  const visited = new Set<string>();
  let current: Conversation = active;

  while (current.isThread && current.parentConversationId) {
    if (visited.has(current.id)) {
      // Cycle detected — bail out with whatever we have
      break;
    }
    visited.add(current.id);

    const parent = byId.get(current.parentConversationId);
    if (!parent) {
      // Parent missing (orphan) — use the parentConversationId as best guess
      return current.parentConversationId;
    }
    current = parent;
  }

  return current.id;
}

/**
 * Collect every conversation that is a descendant of `rootId` in the thread
 * tree, at any depth.  The result is a flat list sorted by `updatedAt`
 * descending (most recently active first).
 *
 * Works for arbitrary depth: thread → sub-thread → sub-sub-thread, etc.
 */
export function listAllDescendants(
  conversations: Conversation[],
  rootId: string,
): Conversation[] {
  // Build a parent→children index for a single O(n) pass
  const childrenOf = new Map<string, Conversation[]>();
  for (const c of conversations) {
    if (c.isThread && c.parentConversationId) {
      const siblings = childrenOf.get(c.parentConversationId);
      if (siblings) {
        siblings.push(c);
      } else {
        childrenOf.set(c.parentConversationId, [c]);
      }
    }
  }

  // BFS / iterative DFS from rootId
  const result: Conversation[] = [];
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = childrenOf.get(parentId);
    if (!children) continue;
    for (const child of children) {
      result.push(child);
      queue.push(child.id);
    }
  }

  result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return result;
}

/**
 * Backward-compatible wrapper: returns only the *direct* children of `rootId`.
 *
 * Prefer {@link listAllDescendants} when you need the full subtree.
 */
export function listThreadsForRoot(
  conversations: Conversation[],
  rootId: string,
): Conversation[] {
  const list = conversations.filter((c) =>
    Boolean(c.isThread && c.parentConversationId === rootId),
  );
  list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return list;
}
