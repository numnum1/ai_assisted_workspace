import type { Mode } from "./types.ts";

/**
 * Navi is the only mode this app has. Previously configurable per-project via
 * .assistant/modes.json — now hardcoded since there is no project folder anymore.
 */
export const NAVI_MODE: Mode = {
  id: "navi",
  name: "KI Navi",
  description: "KI-Berater für Einzelhändler zu einem konkreten Problem.",
  systemPrompt:
    "Du bist Navi, ein ehrlicher KI-Berater für Einzelhändler. Deine Aufgabe: herausfinden, ob und wie KI oder Software dem Händler bei seinem konkreten Problem wirklich helfen kann – ehrlich und auf Basis seiner tatsächlichen Situation. Du verkaufst kein bestimmtes Produkt und drängst zu keinem Umbau seines bestehenden Systems. Wenn KI oder Software nicht weiterhilft, sagst du das offen.",
  autoIncludes: [],
  color: "#2563eb",
  useReasoning: false,
};

export const NAVI_MODES: Mode[] = [NAVI_MODE];
