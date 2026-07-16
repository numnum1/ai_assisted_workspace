export type { NaviTransition, NaviState, NaviSlot } from "../../src/naviStateMachine.js";
export {
  DEFAULT_NAVI_STATES,
  NAVI_INITIAL_STATE_ID,
  getNaviState,
  slugifySlotLabel,
  getEffectiveSlots,
  openSlots,
  allSlotsFilled,
  getAllSlotLabels,
} from "../../src/naviStateMachine.js";
import type { NaviTransition } from "../../src/naviStateMachine.js";

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  return "";
}

/**
 * Builds a prompt for the redirect/safety-net classifier — the semantic exceptions that aren't
 * slot-shaped (topic changes, satisfaction/objection detection, etc). Forward "all info known"
 * progress is handled deterministically via slots + the model's own `advance_phase` tool call;
 * this classifier only ever *redirects* away from that default path, so it is intentionally kept
 * out of the workPlan/cascade business the old combined classifier used to do.
 *
 * @param transitions Only the transitions that need semantic judgment — for slot-bearing states
 *   the caller excludes the primary forward transition (index 0 by convention in NAVI_STATES),
 *   since that one is covered by the deterministic gate instead.
 */
export function buildRedirectClassifierPrompt(
  currentStateId: string,
  userMessage: string,
  transitions: NaviTransition[],
  conversationHistory: Array<{ role: string; content?: string; hidden?: boolean }>,
): { prompt: string; validStates: string[] } {
  const validStates: string[] = ["none"];
  for (const t of transitions) {
    if (!validStates.includes(t.to)) validStates.push(t.to);
  }

  const historyLines = conversationHistory
    .filter(
      (m) =>
        !m.hidden &&
        (m.role === "assistant" || m.role === "user") &&
        normalizeContent(m.content),
    )
    .map((m) => `${m.role === "assistant" ? "Navi" : "Händler"}: ${normalizeContent(m.content)}`);
  const historySection =
    historyLines.length > 0 ? ["Bisheriges Gespräch:", ...historyLines].join("\n") : "";

  const transitionLines = transitions.map((t) => `Ziel ${t.to}: wenn ${t.condition}`);

  const prompt = [
    `Du prüfst NUR, ob eine der folgenden Ausnahme-Situationen zutrifft. Antworte NUR mit einem State-Namen aus dieser Liste: ${validStates.join(", ")}. "none" heißt: keine der Ausnahmen trifft zu, das normale Gespräch läuft weiter. Keine Erklärung, nur der Name.`,
    `Aktueller State: ${currentStateId}`,
    historySection,
    `Letzte Händler-Nachricht: "${userMessage}"`,
    `Mögliche Ausnahmen:\n${transitionLines.join("\n")}`,
    [
      "WICHTIGE REGEL – Sei konservativ:",
      "Wechsle NUR, wenn die genannte Bedingung eindeutig zutrifft.",
      'Im Zweifel "none" zurückgeben.',
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, validStates };
}
