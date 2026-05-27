export type { NaviTransition, NaviState } from "../../src/naviStateMachine.js";
export { NAVI_STATES } from "../../src/naviStateMachine.js";
import { NAVI_STATES } from "../../src/naviStateMachine.js";
import type { NaviState, NaviTransition } from "../../src/naviStateMachine.js";

const STATE_MAP = new Map<string, NaviState>(
  NAVI_STATES.map((s) => [s.id, s]),
);

export function getNaviState(id: string): NaviState | null {
  return STATE_MAP.get(id) ?? null;
}

export function buildClassificationPrompt(
  currentStateId: string,
  userMessage: string,
  transitions: NaviTransition[],
): string {
  const transitionList = transitions
    .map((t, i) => `${i + 1}. ${t.condition} → ${t.to}`)
    .join("\n");
  return [
    'Du analysierst eine Nutzer-Nachricht und entscheidest, welche Transition zutrifft. Antworte NUR mit der Zahl der zutreffenden Transition oder "0" wenn keine zutrifft. Keine Erklärung. Nur die Zahl.',
    `Aktueller State: ${currentStateId}`,
    `Nutzer-Nachricht: "${userMessage}"`,
    `Mögliche Transitions:\n${transitionList}`,
  ].join("\n\n");
}
