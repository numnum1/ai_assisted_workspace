export interface NaviClientState {
  id: string;
  label: string;
  description: string;
  transitions: { to: string; label: string }[];
}

export const NAVI_CLIENT_STATES: NaviClientState[] = [
  {
    id: "greeting",
    label: "Begrüßung",
    description: "Navi stellt sich vor und fragt nach dem Laden.",
    transitions: [
      { to: "ask_problem", label: "Laden genannt" },
      { to: "clarify_problem", label: "Laden + Problem genannt" },
    ],
  },
  {
    id: "ask_problem",
    label: "Problem erfragen",
    description: "Navi fragt, wobei geholfen werden soll.",
    transitions: [{ to: "clarify_problem", label: "Problem genannt" }],
  },
  {
    id: "clarify_problem",
    label: "Problem klären",
    description: "Navi fragt nach bisherigen Maßnahmen.",
    transitions: [{ to: "assess_situation", label: "Maßnahmen beschrieben" }],
  },
  {
    id: "assess_situation",
    label: "Situation einschätzen",
    description: "Navi bewertet, ob Software sinnvoll helfen kann.",
    transitions: [
      { to: "explore_software_stack", label: "Interesse bestätigt" },
      { to: "closing", label: "Kein Bedarf" },
    ],
  },
  {
    id: "explore_software_stack",
    label: "Software-Stack",
    description: "Navi erfragt genutzte Tools und Abläufe.",
    transitions: [{ to: "give_recommendation", label: "Stack beschrieben" }],
  },
  {
    id: "give_recommendation",
    label: "Empfehlung",
    description: "Navi macht einen konkreten Lösungsvorschlag.",
    transitions: [
      { to: "closing", label: "Zufrieden" },
      { to: "refine_recommendation", label: "Einwände" },
    ],
  },
  {
    id: "refine_recommendation",
    label: "Anpassen",
    description: "Navi passt den Vorschlag basierend auf Feedback an.",
    transitions: [
      { to: "closing", label: "Zufrieden" },
      { to: "refine_recommendation", label: "Weitere Einwände" },
    ],
  },
  {
    id: "closing",
    label: "Abschluss",
    description: "Navi fasst zusammen und fragt, ob das alles war (beendet nie von selbst).",
    transitions: [{ to: "clarify_problem", label: "Weiteres Anliegen" }],
  },
];

export function getNaviClientState(id: string): NaviClientState | undefined {
  return NAVI_CLIENT_STATES.find((s) => s.id === id);
}
