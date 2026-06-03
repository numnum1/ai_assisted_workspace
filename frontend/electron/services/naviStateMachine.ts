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
  conversationHistory?: Array<{ role: string; content: string; hidden?: boolean }>,
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

  const historySection = conversationHistory && conversationHistory.length > 0
    ? [
        "Bisheriges Gespräch:",
        conversationHistory
          .filter(
            (m) =>
              !m.hidden &&
              (m.role === "assistant" || m.role === "user") &&
              normalizeContent(m.content),
          )
          .map((m) => {
            const label = m.role === "assistant" ? "Navi" : "Händler";
            return `${label}: ${normalizeContent(m.content)}`;
          })
          .join("\n"),
      ].join("\n")
    : "";

  return [
    'Du analysierst ein Gespräch und entscheidest, welche Transition nach der letzten Händler-Nachricht zutrifft. Antworte NUR mit der Zahl der zutreffenden Transition oder "0" wenn keine zutrifft. Keine Erklärung. Nur die Zahl.',
    `Aktueller State: ${currentStateId}`,
    workPlanSection,
    historySection,
    `Letzte Händler-Nachricht: "${userMessage}"`,
    `Mögliche Transitions:\n${transitionList}`,
    [
      "WICHTIGE REGEL – Sei konservativ, aber fair:",
      "Kurze, aber konkrete Antworten (z. B. 'von Hand', 'Excel', 'täglich', 'noch nichts versucht') sind ausreichend – 'konservativ' bedeutet: inhaltlich vage oder ausweichend, NICHT: kurz.",
      "Wechsle NUR, wenn die Transition-Bedingung vollständig erfüllt ist und (bei Vorwärts-Transitions) alle Arbeitsplan-Punkte durch das Gespräch gedeckt sind.",
      'Im Zweifel "0" zurückgeben.',
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  return "";
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
      ? `Die primären Lernziele dieser Phase waren:\n${workPlan.map((p) => `- ${p}`).join("\n")}`
      : "";
  return [
    `Du fasst zusammen, was der Händler im Navi-Beratungsgespräch während der Phase "${completedStateId}" über sich, seinen Laden oder sein Geschäft mitgeteilt hat.`,
    workPlanHint,
    `Gesprächsauszug:\n${conversationExcerpt}`,
    "Erfasse ALLE konkreten Fakten, die der Händler genannt hat – auch scheinbar nebensächliche Angaben (z. B. genutzte Tools, Kommunikationswege, Plattformen, Arbeitsabläufe, Kontextinfos). Ziel: Nachfolgende Gesprächsphasen sollen nicht nach Dingen fragen, die der Händler hier bereits erwähnt hat.",
    "NUR Fakten aus dem Gespräch – keine Interpretationen, keine Empfehlungen.",
    "Format: ein Stichpunkt pro Zeile, beginnend mit '- ' (4–8 Stichpunkte, je 1 Zeile)",
    "Antworte ausschließlich mit den Stichpunkten, ohne Überschrift oder Einleitung.",
  ].filter(Boolean).join("\n\n");
}
