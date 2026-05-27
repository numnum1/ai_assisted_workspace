const pendingKickoffs = new Set<string>();
const startedKickoffs = new Set<string>();

export function scheduleNaviGreetingKickoff(conversationId: string): void {
  pendingKickoffs.add(conversationId);
}

export function hasPendingNaviGreetingKickoffFor(convId: string): boolean {
  return pendingKickoffs.has(convId);
}

export function tryMarkNaviGreetingKickoffStarted(convId: string): boolean {
  if (startedKickoffs.has(convId)) return false;
  startedKickoffs.add(convId);
  pendingKickoffs.delete(convId);
  return true;
}

export function cancelNaviGreetingKickoffIfMismatch(activeId: string): void {
  if (pendingKickoffs.size === 0) return;
  for (const id of pendingKickoffs) {
    if (id !== activeId) pendingKickoffs.delete(id);
  }
}
