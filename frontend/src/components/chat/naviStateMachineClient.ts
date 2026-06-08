export interface NaviClientState {
  id: string;
  label: string;
  description: string;
  /** Checklist of items the state must accomplish — shown in the panel while this state is active. */
  workPlan: string[];
  transitions: { to: string; label: string }[];
}

export const NAVI_CLIENT_STATES: NaviClientState[] = [
  {
    id: "greeting",
    label: "Begrüßung",
    description: "Navi stellt sich vor und fragt nach dem Laden.",
    workPlan: [],
    transitions: [
      { to: "ask_problem", label: "Laden genannt" },
    ],
  },
  {
    id: "ask_problem",
    label: "Problem erfragen",
    description: "Navi fragt, wobei geholfen werden soll.",
    workPlan: [],
    transitions: [{ to: "clarify_problem", label: "Problem genannt" }],
  },
  {
    id: "clarify_problem",
    label: "Problem klären",
    description: "Navi fragt nach der praktischen Lücke – was konkret fehlt oder nicht klappt.",
    workPlan: [
      "Problem konkret beschrieben (nicht nur benannt – mit erkennbarem Kontext oder Auswirkung)",
      "Praktische Lücke bekannt – der konkrete Schritt, der fehlt oder nicht klappt",
    ],
    transitions: [
      { to: "explore_software_stack", label: "Problem + Lücke bekannt" },
      { to: "ask_problem", label: "Missverständnis – neues Problem" },
    ],
  },
  {
    id: "explore_software_stack",
    label: "Software-Stack",
    description: "Navi erfragt den vollständigen Stack: Kasse, Online-Shop, Kommunikation, problemrelevanter Bereich.",
    workPlan: [
      "Kassensystem oder Hauptverkaufstool bekannt",
      "Online-Präsenz bekannt (Online-Shop ja/nein, Plattform)",
      "Kundenkommunikationsweg bekannt",
      "Tool oder Ablauf für den problemrelevanten Bereich konkret benannt",
    ],
    transitions: [
      { to: "explore_investment", label: "Vollständiger Stack bekannt" },
      { to: "clarify_problem", label: "Neuer Problem-Aspekt aufgetaucht" },
    ],
  },
  {
    id: "explore_investment",
    label: "Aufwandbereitschaft",
    description: "Navi fragt, wie viel Zeit und Geld der Händler in eine Lösung investieren würde.",
    workPlan: [
      "Bereitschaft für Zeitinvestition bekannt",
      "Bereitschaft für Geldbudget bekannt",
    ],
    transitions: [
      { to: "confirm_understanding", label: "Zeit + Budget bekannt" },
    ],
  },
  {
    id: "confirm_understanding",
    label: "Verständnis bestätigen",
    description: "Navi fasst Problem und Stack zusammen und fragt ob alles stimmt.",
    workPlan: [],
    transitions: [
      { to: "assess_situation", label: "Händler bestätigt" },
      { to: "clarify_problem", label: "Problem-Korrektur" },
      { to: "explore_software_stack", label: "Stack-Korrektur" },
    ],
  },
  {
    id: "assess_situation",
    label: "Einschätzung & erster Vorschlag",
    description: "Navi bewertet ehrlich ob KI helfen kann und macht direkt einen ersten konkreten Vorschlag.",
    workPlan: [],
    transitions: [
      { to: "give_recommendation", label: "Händler will mehr Details" },
      { to: "explore_software_stack", label: "Stack-Info unvollständig" },
      { to: "closing", label: "Kein Bedarf" },
    ],
  },
  {
    id: "give_recommendation",
    label: "Empfehlung",
    description: "Navi macht einen konkreten, realistischen Lösungsvorschlag.",
    workPlan: [],
    transitions: [
      { to: "refine_recommendation", label: "Einwände / Fragen" },
      { to: "offer_ai_exploration", label: "Zufrieden" },
    ],
  },
  {
    id: "refine_recommendation",
    label: "Anpassen",
    description: "Navi passt den Vorschlag an oder bietet eine Alternative.",
    workPlan: [],
    transitions: [
      { to: "refine_recommendation", label: "Weitere Einwände" },
      { to: "give_recommendation", label: "Komplett neuer Ansatz nötig" },
      { to: "offer_ai_exploration", label: "Zufrieden" },
    ],
  },
  {
    id: "offer_ai_exploration",
    label: "KI-Erkundung anbieten",
    description: "Navi fragt einmalig und ohne Druck, ob der Händler gezielt KI-Tools ansehen möchte.",
    workPlan: [],
    transitions: [
      { to: "explore_ai_solutions", label: "Ja, KI ansehen" },
      { to: "closing", label: "Nein, danke" },
    ],
  },
  {
    id: "explore_ai_solutions",
    label: "KI-Lösungen",
    description: "Navi zeigt konkrete KI-Tools, die zu Problem und Stack des Händlers passen.",
    workPlan: [],
    transitions: [
      { to: "explore_ai_solutions", label: "Fragen / Einwände" },
      { to: "closing", label: "Zufrieden" },
    ],
  },
  {
    id: "closing",
    label: "Abschluss",
    description: "Navi fasst zusammen und wartet – der Händler entscheidet wann Schluss ist.",
    workPlan: [],
    transitions: [{ to: "clarify_problem", label: "Weiteres Anliegen" }],
  },
];

export function getNaviClientState(id: string): NaviClientState | undefined {
  return NAVI_CLIENT_STATES.find((s) => s.id === id);
}
