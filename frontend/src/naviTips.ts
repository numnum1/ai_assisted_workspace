export interface NaviTip {
  id: string;
  /** Shown in NaviStatePanel as a short label */
  label: string;
  /** Injected into system prompt as guidance for when/how to bring it up */
  instruction: string;
  /** Short description for the classifier: what counts as "covered"? */
  coveredWhen: string;
}

/** Hardcoded seed / reset-to-default tips list. Runtime callers should load the effective (possibly user-edited) list instead — see `electron/services/naviStateConfigService.ts`. */
export const DEFAULT_NAVI_TIPS: NaviTip[] = [
  {
    id: "local_store_cooperation",
    label: "Kooperation mit anderen Läden",
    instruction:
      "Weise darauf hin, dass gemeinsame Werbeaktionen mit benachbarten oder thematisch passenden Läden (z.B. gemeinsame Rabattaktionen, Stadtteilevent, Laufkunden-Weiterempfehlung) eine einfache Möglichkeit sind, Reichweite ohne großen Aufwand zu erhöhen. Bringe diesen Hinweis ein, wenn das Thema Laufkundschaft, lokale Sichtbarkeit oder Neukundengewinnung besprochen wird – am besten im Rahmen einer Empfehlung.",
    coveredWhen:
      "Navi hat gemeinsame Aktionen oder Kooperationen mit anderen lokalen Geschäften als Möglichkeit erwähnt.",
  },
  {
    id: "ai_web_accessibility",
    label: "KI-Zugänglichkeit im Web",
    instruction:
      "Weise darauf hin, dass es heute sinnvoll ist, die eigene Web-Präsenz so aufzusetzen, dass KI-Assistenten wie ChatGPT sie finden und nutzen können – z.B. durch Google Business Profile, strukturierte Inhalte auf der Website und aktuelle Öffnungszeiten. Bringe diesen Hinweis ein, wenn das Thema Website, Online-Präsenz oder Sichtbarkeit aufkommt.",
    coveredWhen:
      "Navi hat erwähnt, dass Web-Dienste oder die Online-Präsenz für KI-Assistenten zugänglich sein sollte.",
  },
];
