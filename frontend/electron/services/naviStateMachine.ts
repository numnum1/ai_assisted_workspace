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
 * Builds a single prompt that replaces the two sequential API calls
 * (state transition classifier + cascade check) with one LLM call.
 *
 * For transition targets that have a workPlan, the prompt includes that
 * workPlan so the LLM can decide in one pass whether to stop at the
 * intermediate state or cascade one hop further.
 *
 * @returns prompt text and the set of valid state ID strings the LLM may return.
 *   The LLM must respond with exactly one of these, or "none" for no transition.
 */
export function buildCombinedClassifierPrompt(
  currentStateId: string,
  userMessage: string,
  transitions: NaviTransition[],
  workPlan: string[],
  conversationHistory: Array<{ role: string; content?: string; hidden?: boolean }>,
  effectiveWorkPlanFn: (stateId: string, base: string[]) => string[],
): { prompt: string; validStates: string[] } {
  const validStates: string[] = ["none"];

  const workPlanSection =
    workPlan.length > 0
      ? [
          "Arbeitsplan des aktuellen States (alle Punkte müssen bekannt sein, bevor eine Vorwärts-Transition erlaubt ist):",
          workPlan.map((item, i) => `  ${i + 1}. ${item}`).join("\n"),
          "Prüfe zuerst: Sind ALLE Arbeitsplan-Punkte durch das bisherige Gespräch gedeckt? Wenn nein → none.",
        ].join("\n")
      : "";

  const historyLines = conversationHistory
    .filter(
      (m) =>
        !m.hidden &&
        (m.role === "assistant" || m.role === "user") &&
        normalizeContent(m.content),
    )
    .map(
      (m) =>
        `${m.role === "assistant" ? "Navi" : "Händler"}: ${normalizeContent(m.content)}`,
    );
  const historySection =
    historyLines.length > 0 ? ["Bisheriges Gespräch:", ...historyLines].join("\n") : "";

  const transitionLines: string[] = [];

  for (const t of transitions) {
    const targetState = getNaviState(t.to);
    const targetWorkPlan = targetState ? effectiveWorkPlanFn(t.to, targetState.workPlan) : [];
    const cascadeTransitions = targetState?.transitions ?? [];
    const hasCascade = targetWorkPlan.length > 0 && cascadeTransitions.length > 0;

    if (!validStates.includes(t.to)) validStates.push(t.to);

    if (hasCascade) {
      const cascadeTarget = cascadeTransitions[0].to;
      if (!validStates.includes(cascadeTarget)) validStates.push(cascadeTarget);
      transitionLines.push(
        [
          `Ziel ${t.to}: wenn ${t.condition}`,
          `  WorkPlan von ${t.to} (alle Punkte müssen bereits bekannt sein):`,
          ...targetWorkPlan.map((p, i) => `    ${i + 1}. ${p}`),
          `  → Falls WorkPlan VOLLSTÄNDIG erfüllt: antworte mit "${cascadeTarget}"`,
          `  → Sonst: antworte mit "${t.to}"`,
        ].join("\n"),
      );
    } else {
      transitionLines.push(`Ziel ${t.to}: wenn ${t.condition}`);
    }
  }

  const prompt = [
    `Du analysierst ein Gespräch und bestimmst den nächsten State. Antworte NUR mit einem State-Namen aus dieser Liste: ${validStates.join(", ")}. Keine Erklärung. Nur der State-Name.`,
    `Aktueller State: ${currentStateId}`,
    workPlanSection,
    historySection,
    `Letzte Händler-Nachricht: "${userMessage}"`,
    `Mögliche Transitions:\n${transitionLines.join("\n\n")}`,
    [
      "WICHTIGE REGEL – Sei konservativ, aber fair:",
      "Kurze, aber konkrete Antworten (z.B. 'von Hand', 'Excel', 'täglich') sind ausreichend – 'konservativ' bedeutet: inhaltlich vage oder ausweichend, NICHT: kurz.",
      "Wechsle NUR, wenn die Transition-Bedingung vollständig erfüllt ist und (bei Vorwärts-Transitions) alle Arbeitsplan-Punkte durch das Gespräch gedeckt sind.",
      "Im Zweifel none zurückgeben.",
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, validStates };
}

/**
 * Builds a prompt that extracts a structured NaviContext fact sheet from the conversation.
 * Updated at each state transition so all states have a clean, current overview.
 *
 * When `withProblemDetails` is true (first entry into clarify_problem), the prompt
 * additionally extracts `problemInterpretation` and `problemQueue` — replacing the
 * former separate Call 2c (problem extraction).
 */
export function buildNaviContextPrompt(
  conversationExcerpt: string,
  withProblemDetails = false,
): string {
  const baseSchema =
    '{ "laden": "Ladentyp, Branche, Standort, Kontext – alles was der Händler über seinen Laden erwähnt hat (null wenn unbekannt)", "problem": "Das konkrete Problem oder der Wunsch – kurz und präzise (null wenn unbekannt)", "luecke": "Die praktische Lücke – der konkrete fehlende Schritt (null wenn unbekannt)", "stack": "Software-Stack in einem Satz, z.B. Kasse: X, Online-Shop: X, Komm: X (null wenn unbekannt)", "investition": "Bereitschaft für Zeit und Geld in einem Satz, z.B. Zeit: X h/Woche, Budget: X €/Monat (null wenn unbekannt)", "empfehlung": "Gemachter Lösungsvorschlag (null wenn noch keiner gemacht)", "details": "Alle weiteren konkreten Fakten in Stichpunktform – z.B. genutzte Tools, spezifische Kommunikationswege, Abläufe, Plattformen, Angaben die nicht in die Hauptfelder passen. Beginne jeden Punkt mit \'- \'. (null wenn nichts Zusätzliches)" }';

  const extendedSchema =
    '{ "laden": "Ladentyp, Branche, Standort, Kontext (null wenn unbekannt)", "problem": "Das konkrete Problem – kurz und präzise (null wenn unbekannt)", "luecke": "Die praktische Lücke – der fehlende Schritt (null wenn unbekannt)", "stack": "Software-Stack in einem Satz (null wenn unbekannt)", "investition": "Bereitschaft für Zeit und Geld (null wenn unbekannt)", "empfehlung": "Gemachter Lösungsvorschlag (null wenn keiner)", "details": "Weitere konkrete Fakten als Stichpunkte (null wenn keine)", "problemInterpretation": "Was bedeutet das Problem wirklich, in welche Richtung zeigt die Lösung – z.B. \'Struktureller Rückgang der Laufkundschaft – Lösung: externe Reichweite erschließen, nicht Außenauftritt optimieren\' (null wenn unklar)", "problemQueue": ["weitere explizit genannte Probleme oder Anliegen des Händlers – leeres Array wenn keine"] }';

  return [
    "Du analysierst ein Beratungsgespräch zwischen Navi (KI-Berater) und einem Händler.",
    `Extrahiere alle bisher sicher bekannten Fakten als JSON-Objekt mit diesen Feldern:\n${withProblemDetails ? extendedSchema : baseSchema}`,
    `Gesprächsauszug:\n${conversationExcerpt}`,
    "Setze null für Felder die noch nicht klar bekannt sind. Nur direkt Genanntes – keine Interpretationen.",
    "Antworte NUR mit dem JSON-Objekt, ohne Markdown-Block und ohne weiteren Text.",
  ].join("\n\n");
}

