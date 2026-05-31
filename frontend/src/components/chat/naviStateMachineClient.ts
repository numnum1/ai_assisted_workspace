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
    description: "Navi fragt gezielt nach, bis Problem, Ausmaß, bisheriger Umgang und Ziel bekannt sind.",
    transitions: [
      { to: "explore_software_stack", label: "Arbeitsplan vollständig" },
      { to: "ask_problem", label: "Missverständnis – neues Problem" },
    ],
  },
  {
    id: "explore_software_stack",
    label: "Software-Stack",
    description: "Navi erfragt genutzte Tools und Abläufe für den relevanten Bereich.",
    transitions: [
      { to: "assess_situation", label: "Stack bekannt" },
      { to: "clarify_problem", label: "Neuer Problem-Aspekt aufgetaucht" },
    ],
  },
  {
    id: "assess_situation",
    label: "Situation einschätzen",
    description: "Navi bewertet ehrlich, ob KI hier sinnvoll helfen kann.",
    transitions: [
      { to: "give_recommendation", label: "Händler möchte Vorschlag" },
      { to: "explore_software_stack", label: "Stack-Info unvollständig" },
      { to: "closing", label: "Kein Bedarf" },
    ],
  },
  {
    id: "give_recommendation",
    label: "Empfehlung",
    description: "Navi macht einen konkreten, realistischen Lösungsvorschlag.",
    transitions: [
      { to: "refine_recommendation", label: "Einwände / Fragen" },
      { to: "closing", label: "Zufrieden" },
    ],
  },
  {
    id: "refine_recommendation",
    label: "Anpassen",
    description: "Navi passt den Vorschlag an oder bietet eine Alternative.",
    transitions: [
      { to: "refine_recommendation", label: "Weitere Einwände" },
      { to: "give_recommendation", label: "Komplett neuer Ansatz nötig" },
      { to: "closing", label: "Zufrieden" },
    ],
  },
  {
    id: "closing",
    label: "Abschluss",
    description: "Navi fasst zusammen und wartet – der Händler entscheidet wann Schluss ist.",
    transitions: [{ to: "clarify_problem", label: "Weiteres Anliegen" }],
  },
];

export function getNaviClientState(id: string): NaviClientState | undefined {
  return NAVI_CLIENT_STATES.find((s) => s.id === id);
}
