// Orchestration state for the simulation auto-runner: after Navi answers in a
// simulation conversation, a simulated merchant reply is generated and sent so
// the whole Navi flow plays out without a human typing.
//
// `pending` — conversations that are waiting for the next merchant reply.
// `running` — conversations whose merchant reply is currently being generated/sent,
//             guarding against the effect firing twice for the same round.

const pending = new Set<string>();
const running = new Set<string>();

/** Queue a merchant reply for this conversation (called after Navi finished a turn). */
export function scheduleSimulationReply(conversationId: string): void {
  pending.add(conversationId);
}

export function hasPendingSimulationReply(conversationId: string): boolean {
  return pending.has(conversationId);
}

/**
 * Atomically claim the pending merchant reply for this conversation.
 * Returns false if there is nothing pending or one is already in flight.
 */
export function tryStartSimulationReply(conversationId: string): boolean {
  if (running.has(conversationId)) return false;
  if (!pending.has(conversationId)) return false;
  pending.delete(conversationId);
  running.add(conversationId);
  return true;
}

/** Release the in-flight guard once the merchant message has been sent (or failed). */
export function finishSimulationReply(conversationId: string): void {
  running.delete(conversationId);
}

/** Drop all simulation state for a conversation (e.g. on closing or switch away). */
export function clearSimulationReply(conversationId: string): void {
  pending.delete(conversationId);
  running.delete(conversationId);
}
