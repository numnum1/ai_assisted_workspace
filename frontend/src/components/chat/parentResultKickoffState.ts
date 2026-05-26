/**
 * Pending parent-integration kickoffs: after a subthread calls report_thread_result,
 * we schedule the parent conversation to receive a hidden integration message
 * when it next becomes active.
 *
 * Queue-based (not a single slot) so multiple threads completing before the parent
 * is opened are all processed in order.
 */

export const PARENT_RESULT_INTEGRATION_USER_MESSAGE =
  'Ein Subthread hat seine Arbeit abgeschlossen und das Ergebnis wurde als letzte Nachricht gespeichert. ' +
  'Integriere die Erkenntnisse in den Arbeitsplan: markiere den entsprechenden Schritt als abgeschlossen, ' +
  'füge die wesentlichen Befunde ein und gib danach den vollständigen aktualisierten ```plan```-Block aus. ' +
  'Fahre dann mit dem nächsten offenen Schritt fort.';

export interface PendingParentKickoff {
  parentConversationId: string;
  threadTitle?: string;
  /** Unique token used as the Strict-Mode double-fire guard key. */
  token: string;
}

const pendingQueue: PendingParentKickoff[] = [];
const startedTokens = new Set<string>();

export function scheduleParentResultKickoff(kickoff: Omit<PendingParentKickoff, 'token'>): void {
  pendingQueue.push({ ...kickoff, token: crypto.randomUUID() });
}

export function hasPendingParentResultKickoffFor(activeId: string): boolean {
  return pendingQueue.some((k) => k.parentConversationId === activeId);
}

/** Removes and returns the next pending kickoff for this conversation, or null if none. */
export function consumeNextPendingKickoffFor(activeId: string): PendingParentKickoff | null {
  const idx = pendingQueue.findIndex((k) => k.parentConversationId === activeId);
  if (idx === -1) return null;
  return pendingQueue.splice(idx, 1)[0]!;
}

/** Prevent double-fire from React Strict Mode; returns false if already started. */
export function tryMarkKickoffStarted(token: string): boolean {
  if (startedTokens.has(token)) return false;
  startedTokens.add(token);
  return true;
}
