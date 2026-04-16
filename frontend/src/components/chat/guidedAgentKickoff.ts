/**
 * Guided agent preset: auto-start first assistant turn (hidden user bootstrap).
 * Module-level state survives React Strict Mode remounts within the same page session.
 */

/** User turn text for the API; hidden in UI so the first visible bubble is the assistant. */
export const GUIDED_AGENT_KICKOFF_USER_MESSAGE =
  'Die geführte Sitzung startet jetzt. Der verbindliche Arbeitsplan steht im Panel — beginne mit Schritt 1, ' +
  'mache einen konkreten Fortschritt und gib danach den vollständigen aktualisierten ```plan```-Block aus.';

let pendingKickoffConversationId: string | null = null;

const kickoffStartedConversationIds = new Set<string>();

export function scheduleGuidedAgentPresetKickoff(conversationId: string): void {
  pendingKickoffConversationId = conversationId;
}

export function hasPendingGuidedAgentKickoffFor(activeConversationId: string): boolean {
  return pendingKickoffConversationId === activeConversationId;
}

export function clearPendingGuidedAgentKickoff(): void {
  pendingKickoffConversationId = null;
}

/** If the user switched away before kickoff ran, drop the pending id so it never fires on the wrong tab. */
export function cancelGuidedAgentKickoffIfPendingMismatchesActive(activeConversationId: string): void {
  if (pendingKickoffConversationId != null && pendingKickoffConversationId !== activeConversationId) {
    pendingKickoffConversationId = null;
  }
}

/** @returns true if this is the first kickoff attempt for this conversation (Strict Mode / double-effect guard). */
export function tryMarkGuidedAgentKickoffStarted(conversationId: string): boolean {
  if (kickoffStartedConversationIds.has(conversationId)) return false;
  kickoffStartedConversationIds.add(conversationId);
  return true;
}
