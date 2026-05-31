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
  workPlan: string[],
): string {
  const transitionList = transitions
    .map((t, i) => `${i + 1}. ${t.condition} → ${t.to}`)
    .join("\n");

  const workPlanSection =
    workPlan.length > 0
      ? [
          "Arbeitsplan des aktuellen States (alle Punkte müssen bekannt sein, bevor eine Vorwärts-Transition erlaubt ist):",
          workPlan.map((item, i) => `  ${i + 1}. ${item}`).join("\n"),
          "Prüfe zuerst: Sind ALLE Arbeitsplan-Punkte durch das bisherige Gespräch gedeckt? Wenn nein → antworte 0.",
        ].join("\n")
      : "";

  return [
    'Du analysierst eine Nutzer-Nachricht und entscheidest, welche Transition zutrifft. Antworte NUR mit der Zahl der zutreffenden Transition oder "0" wenn keine zutrifft. Keine Erklärung. Nur die Zahl.',
    `Aktueller State: ${currentStateId}`,
    workPlanSection,
    `Nutzer-Nachricht: "${userMessage}"`,
    `Mögliche Transitions:\n${transitionList}`,
    [
      "WICHTIGE REGEL – Sei konservativ:",
      "Menschen teilen selten alles auf einmal mit. Eine kurze, vage oder oberflächliche Antwort rechtfertigt KEINEN Übergang.",
      "Wechsle NUR, wenn die Transition-Bedingung vollständig erfüllt ist und (bei Vorwärts-Transitions) alle Arbeitsplan-Punkte gedeckt sind.",
      'Im Zweifel immer "0" zurückgeben.',
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Builds a prompt that extracts a compact summary of what was learned in a completed state.
 * The summary is stored in naviResults and injected as context in subsequent states.
 */
export function buildStateSummaryPrompt(
  completedStateId: string,
  workPlan: string[],
  conversationExcerpt: string,
): string {
  const workPlanHint =
    workPlan.length > 0
      ? `Der State sollte folgendes herausfinden:\n${workPlan.map((p) => `- ${p}`).join("\n")}\n\n`
      : "";
  return [
    `Du fasst zusammen, was im Navi-Beratungsgespräch im State "${completedStateId}" herausgefunden wurde.`,
    `${workPlanHint}Gesprächsauszug:\n${conversationExcerpt}`,
    "Schreibe eine kompakte Zusammenfassung der konkreten Fakten (3–6 Stichpunkte, je 1 Zeile).",
    "NUR Fakten aus dem Gespräch – keine Interpretationen, keine Empfehlungen.",
    "Format: ein Stichpunkt pro Zeile, beginnend mit '- '",
    "Antworte ausschließlich mit den Stichpunkten, ohne Überschrift oder Einleitung.",
  ].join("\n\n");
}
