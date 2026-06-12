import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentPreset,
  Mode,
  ProjectConfig,
  WorkspaceModeInfo,
  WorkspaceModeSchema,
} from "../../src/types.js";

interface StoredProjectData {
  config?: ProjectConfig;
  modes?: Mode[];
  agents?: AgentPreset[];
}

const ASSISTANT_DIR = ".assistant";
const PROJECT_CONFIG_FILE = "project.json";
const MODES_FILE = "modes.json";
const AGENTS_FILE = "agents.json";
const WORKSPACE_MODE_PLUGINS_DIR = "workspace-modes";

const BUILTIN_WORKSPACE_MODES: WorkspaceModeSchema[] = [
  {
    id: "default",
    name: "Standard",
    icon: "Folder",
    mediaType: false,
    editorMode: "standard",
    proseLeafLevel: "action",
    rootMetaLabel: "Projekt-Metadaten",
    rootMetaIcon: "FolderOpen",
    levels: [
      {
        key: "chapter",
        label: "Ordner",
        labelNew: "Neuer Ordner",
        icon: "Folder",
      },
      {
        key: "scene",
        label: "Datei",
        labelNew: "Neue Datei",
        icon: "FileText",
      },
      {
        key: "action",
        label: "Abschnitt",
        labelNew: "Neuer Abschnitt",
        icon: "SquarePen",
      },
    ],
    metaSchemas: {},
  },
  {
    id: "book",
    name: "Buch",
    icon: "BookOpen",
    mediaType: true,
    editorMode: "prose",
    proseLeafLevel: "action",
    rootMetaLabel: "Buch-Metadaten",
    rootMetaIcon: "BookOpen",
    levels: [
      {
        key: "chapter",
        label: "Kapitel",
        labelNew: "Neues Kapitel",
        icon: "BookOpen",
      },
      {
        key: "scene",
        label: "Szene",
        labelNew: "Neue Szene",
        icon: "Clapperboard",
      },
      {
        key: "action",
        label: "Aktion",
        labelNew: "Neue Aktion",
        icon: "PenLine",
      },
    ],
    metaSchemas: {},
  },
  {
    id: "music",
    name: "Musik",
    icon: "Music",
    mediaType: true,
    editorMode: "prose",
    proseLeafLevel: "scene",
    rootMetaLabel: "Song-Metadaten",
    rootMetaIcon: "Music",
    levels: [
      { key: "chapter", label: "Song", labelNew: "Neuer Song", icon: "Music" },
      {
        key: "scene",
        label: "Part",
        labelNew: "Neuer Part",
        icon: "ListMusic",
      },
      {
        key: "action",
        label: "Zeile",
        labelNew: "Neue Zeile",
        icon: "Pilcrow",
      },
    ],
    metaSchemas: {},
  },
];

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  name: "",
  description: "",
  alwaysInclude: [],
  defaultMode: "",
  workspaceMode: "default",
  quickChatLlmId: "",
  threadSummaryLlmId: "",
  extraFeatures: {},
};

const DEFAULT_MODES: Mode[] = [
  // Modes ONLY personalize the persona/task framing. The working method
  // (chat is disposable, durable facts go to the wiki) is baseline behavior
  // defined in buildSystemPrompt — deliberately NOT repeated per mode.
  {
    id: "review",
    name: "Story-Review",
    systemPrompt:
      "Hilf beim Story-Review: analysiere Aufbau, Spannungsbogen, Figuren, Motivation und Logik — klar, konkret und konstruktiv.",
    autoIncludes: [],
    color: "#7c3aed",
    useReasoning: false,
  },
  {
    id: "entwickeln",
    name: "Story entwickeln",
    systemPrompt:
      "Hilf, die Geschichte weiterzuentwickeln: stelle gezielte Fragen, biete Alternativen an und denke Figuren, Konflikte und Plot gemeinsam mit dem Autor weiter.",
    autoIncludes: [],
    color: "#059669",
    useReasoning: false,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    systemPrompt:
      "Sei ein kreativer Sparringspartner. Liefere viele Ideen, ungewöhnliche Richtungen und Was-wäre-wenn-Szenarien.",
    autoIncludes: [],
    color: "#0891b2",
    useReasoning: false,
  },
  {
    id: "rechtschreibung",
    name: "Rechtschreibung",
    systemPrompt:
      "Mach eine Rechtschreib- und Grammatikprüfung. Korrigiere Fehler, ohne Stil oder Inhalt zu verändern, und liste die Korrekturen knapp auf.",
    autoIncludes: [],
    color: "#b45309",
    useReasoning: false,
  },
  {
    id: "buchentwicklung",
    name: "Buchentwicklung",
    systemPrompt:
      "Du entwickelst mit dem Autor die Story (Figuren, Orte, Plot, Themen, Weltregeln) — du schreibst keine Kapitel aus. " +
      "Arbeite ein Thema pro Block. Führe sichtbar eine Liste offener Fragen mit und arbeite sie nacheinander ab. " +
      "Trenne strikt Offenes von Entschiedenem.\n\n" +
      "**Beschluss-Ritual (verbindlich):** Beende jeden Themenblock mit einem expliziten Beschlussvorschlag in genau diesem Format:\n" +
      "`Festhalten als Kanon? → [ein prägnanter Satz, der den Beschluss vollständig wiedergibt]`\n\n" +
      "**Mechanische Regeln (kein Ermessen):**\n" +
      "- User bestätigt einen Beschlussvorschlag (\"ja\", \"passt\", \"festhalten\" o. Ä.) → schreibe den Beschluss SOFORT ins Wiki, bevor du irgendetwas anderes tust: `edit_file` für bestehende Einträge, `write_file` für neue. Prüfe vorher mit `grep`/`semantic_search`, ob die Entität (auch unter einem Alias) schon existiert — keine Dubletten.\n" +
      "- Eine spekulative Idee wird besprochen, aber nicht bestätigt → NICHT ins Wiki schreiben; halte sie nur in der Liste offener Punkte.\n" +
      "- Etwas widerspricht bekanntem Kanon → weise den Autor darauf hin und überschreibe den bestehenden Eintrag NICHT ungefragt.\n\n" +
      "**Statuszeile (verbindlich):** Beende JEDE Antwort mit einer letzten Zeile in genau diesem Format:\n" +
      "`STATUS: offen` (Thema noch in Diskussion) oder `STATUS: beschlossen` (in diesem Turn wurde mindestens ein Beschluss ins Wiki geschrieben).",
    autoIncludes: [],
    color: "#c2410c",
    useReasoning: false,
  },
  {
    // Role/identity prompt for Navi sessions. Selected via project settings →
    // Navi tab → "Navi-Modus". The systemPrompt below replaces Navi's default
    // role briefing (NAVI_DEFAULT_ROLE); the HOW-rules in naviVoice.ts stay in force.
    id: "navi",
    name: "KI Navi",
    systemPrompt:
      "Du bist Navi, ein ehrlicher KI-Berater für Einzelhändler. Deine Aufgabe: herausfinden, ob und wie KI oder Software dem Händler bei seinem konkreten Problem wirklich helfen kann – ehrlich und auf Basis seiner tatsächlichen Situation. Du verkaufst kein bestimmtes Produkt und drängst zu keinem Umbau seines bestehenden Systems. Wenn KI oder Software nicht weiterhilft, sagst du das offen.",
    autoIncludes: [],
    color: "#2563eb",
    useReasoning: false,
  },
];

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getProjectPathOrThrow(projectPath: string | null): string {
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  return projectPath;
}

function getAssistantDir(projectPath: string): string {
  return path.join(projectPath, ASSISTANT_DIR);
}

function getProjectConfigPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), PROJECT_CONFIG_FILE);
}

function getModesPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), MODES_FILE);
}

function getAgentsPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), AGENTS_FILE);
}

function getWorkspaceModesDataDirPath(): string {
  return path.join(
    os.homedir(),
    ".writing-assistant",
    WORKSPACE_MODE_PLUGINS_DIR,
  );
}

async function ensureAssistantDir(projectPath: string): Promise<void> {
  await fs.mkdir(getAssistantDir(projectPath), { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeProjectConfig(input?: ProjectConfig | null): ProjectConfig {
  const maxToolRounds =
    typeof input?.maxToolRounds === "number" && input.maxToolRounds >= 1
      ? Math.round(input.maxToolRounds)
      : undefined;
  const rules = Array.isArray(input?.rules)
    ? input.rules
        .filter((r) => r && typeof r === "object" && typeof r.name === "string" && r.name.trim().length > 0)
        .map((r) => ({ name: (r as { name: string; body?: string }).name.trim(), body: typeof (r as { name: string; body?: string }).body === "string" ? (r as { name: string; body: string }).body : "" }))
    : [];
  const naviInstructionsRaw: Record<string, string> = {};
  if (input?.naviInstructions && typeof input.naviInstructions === "object") {
    for (const [k, v] of Object.entries(input.naviInstructions)) {
      if (typeof k === "string" && k.trim() && typeof v === "string" && v.trim()) {
        naviInstructionsRaw[k.trim()] = v;
      }
    }
  }
  const naviInstructions = Object.keys(naviInstructionsRaw).length > 0 ? naviInstructionsRaw : undefined;

  const naviWorkPlansRaw: Record<string, string[]> = {};
  if (input?.naviWorkPlans && typeof input.naviWorkPlans === "object") {
    for (const [k, v] of Object.entries(input.naviWorkPlans)) {
      if (typeof k === "string" && k.trim() && Array.isArray(v)) {
        const items = v.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (items.length > 0) naviWorkPlansRaw[k.trim()] = items;
      }
    }
  }
  const naviWorkPlans = Object.keys(naviWorkPlansRaw).length > 0 ? naviWorkPlansRaw : undefined;

  const naviPlanHintsRaw: Record<string, { include: string[]; exclude: string[] }> = {};
  if (input?.naviPlanHints && typeof input.naviPlanHints === "object") {
    for (const [k, v] of Object.entries(input.naviPlanHints)) {
      if (typeof k !== "string" || !k.trim() || !v || typeof v !== "object") continue;
      const include = Array.isArray(v.include)
        ? v.include.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const exclude = Array.isArray(v.exclude)
        ? v.exclude.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      if (include.length > 0 || exclude.length > 0) {
        naviPlanHintsRaw[k.trim()] = { include, exclude };
      }
    }
  }
  const naviPlanHints = Object.keys(naviPlanHintsRaw).length > 0 ? naviPlanHintsRaw : undefined;

  const naviModeId =
    typeof input?.naviModeId === "string" && input.naviModeId.trim()
      ? input.naviModeId.trim()
      : undefined;
  const naviLlmId =
    typeof input?.naviLlmId === "string" && input.naviLlmId.trim()
      ? input.naviLlmId.trim()
      : undefined;
  return {
    name: input?.name ?? "",
    description: input?.description ?? "",
    alwaysInclude: Array.isArray(input?.alwaysInclude)
      ? input.alwaysInclude
      : [],
    defaultMode: input?.defaultMode ?? "",
    workspaceMode: input?.workspaceMode ?? "default",
    quickChatLlmId: input?.quickChatLlmId ?? "",
    threadSummaryLlmId: input?.threadSummaryLlmId ?? "",
    ...(maxToolRounds !== undefined ? { maxToolRounds } : {}),
    rules,
    ...(naviInstructions !== undefined ? { naviInstructions } : {}),
    ...(naviWorkPlans !== undefined ? { naviWorkPlans } : {}),
    ...(naviPlanHints !== undefined ? { naviPlanHints } : {}),
    ...(naviModeId !== undefined ? { naviModeId } : {}),
    ...(naviLlmId !== undefined ? { naviLlmId } : {}),
    extraFeatures: input?.extraFeatures ?? {},
  };
}

function normalizeMode(input: Mode): Mode {
  return {
    id: input.id,
    name: input.name,
    systemPrompt: input.systemPrompt,
    autoIncludes: Array.isArray(input.autoIncludes) ? input.autoIncludes : [],
    color: input.color,
    useReasoning: input.useReasoning,
    agentOnly: input.agentOnly,
    llmId: input.llmId,
  };
}

function normalizeAgent(input: AgentPreset): AgentPreset {
  return {
    id: input.id,
    name: input.name,
    modeId: input.modeId,
    llmId: input.llmId ?? null,
    threadLlmId: input.threadLlmId ?? null,
    threadModeId: input.threadModeId ?? null,
    useReasoning: input.useReasoning,
    disabledToolkits: Array.isArray(input.disabledToolkits)
      ? input.disabledToolkits
      : [],
    initialSteeringPlan: input.initialSteeringPlan ?? null,
  };
}

async function readStoredProjectData(
  projectPath: string,
): Promise<StoredProjectData> {
  const [config, modes, agents] = await Promise.all([
    readJsonFile<ProjectConfig>(getProjectConfigPath(projectPath)),
    readJsonFile<Mode[]>(getModesPath(projectPath)),
    readJsonFile<AgentPreset[]>(getAgentsPath(projectPath)),
  ]);

  return {
    config: config ?? undefined,
    modes: modes ?? undefined,
    agents: agents ?? undefined,
  };
}

async function loadUserWorkspaceModes(): Promise<WorkspaceModeSchema[]> {
  const dataDir = getWorkspaceModesDataDirPath();
  if (!(await exists(dataDir))) {
    return [];
  }

  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
    )
    .map((entry) => path.join(dataDir, entry.name));

  const modes = await Promise.all(
    files.map(async (filePath) => {
      const mode = await readJsonFile<WorkspaceModeSchema>(filePath);
      return mode;
    }),
  );

  return modes.filter((mode): mode is WorkspaceModeSchema => {
    return (
      !!mode && typeof mode.id === "string" && typeof mode.name === "string"
    );
  });
}

async function getAllWorkspaceModeSchemas(): Promise<WorkspaceModeSchema[]> {
  const userModes = await loadUserWorkspaceModes();
  const byId = new Map<string, WorkspaceModeSchema>();

  for (const mode of BUILTIN_WORKSPACE_MODES) {
    byId.set(mode.id, mode);
  }
  for (const mode of userModes) {
    byId.set(mode.id, mode);
  }

  return [...byId.values()];
}

export async function getProjectConfigStatus(
  projectPath: string | null,
): Promise<{ initialized: boolean }> {
  if (!projectPath) {
    return { initialized: false };
  }
  return {
    initialized: await exists(getAssistantDir(projectPath)),
  };
}

export async function initProjectConfig(
  projectPath: string | null,
): Promise<ProjectConfig> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  await ensureAssistantDir(resolvedProjectPath);

  const config = normalizeProjectConfig(DEFAULT_PROJECT_CONFIG);
  await Promise.all([
    writeJsonFile(getProjectConfigPath(resolvedProjectPath), config),
    writeJsonFile(getModesPath(resolvedProjectPath), DEFAULT_MODES),
    writeJsonFile(getAgentsPath(resolvedProjectPath), []),
  ]);

  return config;
}

export async function getProjectConfig(
  projectPath: string | null,
): Promise<ProjectConfig> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  const stored = await readJsonFile<ProjectConfig>(
    getProjectConfigPath(resolvedProjectPath),
  );
  return normalizeProjectConfig(stored ?? DEFAULT_PROJECT_CONFIG);
}

export async function updateProjectConfig(
  projectPath: string | null,
  config: ProjectConfig,
): Promise<ProjectConfig> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  await ensureAssistantDir(resolvedProjectPath);

  const normalized = normalizeProjectConfig(config);
  await writeJsonFile(getProjectConfigPath(resolvedProjectPath), normalized);
  return normalized;
}

export async function getProjectModes(
  projectPath: string | null,
): Promise<Mode[]> {
  if (!projectPath) {
    return DEFAULT_MODES.map(normalizeMode);
  }
  const stored = await readJsonFile<Mode[]>(getModesPath(projectPath));
  const modes =
    Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_MODES;
  return modes.map(normalizeMode);
}

export async function saveProjectMode(
  projectPath: string | null,
  id: string,
  mode: Mode,
): Promise<Mode> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  await ensureAssistantDir(resolvedProjectPath);

  const modes = await getProjectModes(resolvedProjectPath);
  const normalized = normalizeMode({ ...mode, id });

  const next = modes.filter((entry) => entry.id !== id);
  next.push(normalized);
  next.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  await writeJsonFile(getModesPath(resolvedProjectPath), next);
  return normalized;
}

export async function deleteProjectMode(
  projectPath: string | null,
  id: string,
): Promise<{ status: string }> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  const modes = await getProjectModes(resolvedProjectPath);
  const next = modes.filter((entry) => entry.id !== id);
  await writeJsonFile(getModesPath(resolvedProjectPath), next);
  return { status: "ok" };
}

/** Restores the built-in default modes, discarding all custom modes. */
export async function resetProjectModes(
  projectPath: string | null,
): Promise<Mode[]> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  await ensureAssistantDir(resolvedProjectPath);
  const defaults = DEFAULT_MODES.map(normalizeMode);
  await writeJsonFile(getModesPath(resolvedProjectPath), defaults);
  return defaults;
}

export async function listProjectAgents(
  projectPath: string | null,
): Promise<AgentPreset[]> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  const stored = await readJsonFile<AgentPreset[]>(
    getAgentsPath(resolvedProjectPath),
  );
  return Array.isArray(stored) ? stored.map(normalizeAgent) : [];
}

export async function saveProjectAgent(
  projectPath: string | null,
  id: string,
  preset: AgentPreset,
): Promise<AgentPreset> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  await ensureAssistantDir(resolvedProjectPath);

  const agents = await listProjectAgents(resolvedProjectPath);
  const normalized = normalizeAgent({ ...preset, id });

  const next = agents.filter((entry) => entry.id !== id);
  next.push(normalized);
  next.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  await writeJsonFile(getAgentsPath(resolvedProjectPath), next);
  return normalized;
}

export async function deleteProjectAgent(
  projectPath: string | null,
  id: string,
): Promise<{ status: string }> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  const agents = await listProjectAgents(resolvedProjectPath);
  const next = agents.filter((entry) => entry.id !== id);
  await writeJsonFile(getAgentsPath(resolvedProjectPath), next);
  return { status: "ok" };
}

export async function getWorkspaceMode(
  _projectPath: string | null,
  modeId?: string | null,
): Promise<WorkspaceModeSchema> {
  const resolvedId = modeId?.trim() || "default";
  const allModes = await getAllWorkspaceModeSchemas();
  const found = allModes.find((mode) => mode.id === resolvedId);

  if (!found) {
    throw new Error(`Workspace mode not found: ${resolvedId}`);
  }

  return found;
}

export async function listWorkspaceModes(
  _projectPath: string | null,
): Promise<WorkspaceModeInfo[]> {
  const userModes = await loadUserWorkspaceModes();
  const builtinIds = new Set(BUILTIN_WORKSPACE_MODES.map((mode) => mode.id));

  const merged = [...BUILTIN_WORKSPACE_MODES, ...userModes];
  const deduped = new Map<string, WorkspaceModeSchema>();

  for (const mode of merged) {
    deduped.set(mode.id, mode);
  }

  return [...deduped.values()]
    .map((mode) => ({
      id: mode.id,
      name: mode.name,
      source: builtinIds.has(mode.id)
        ? ("builtin" as const)
        : ("user" as const),
      icon: mode.icon ?? "Folder",
      mediaType: mode.mediaType === true,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function getWorkspaceModesDataDir(): Promise<{
  path: string;
  exists: boolean;
}> {
  const dirPath = getWorkspaceModesDataDirPath();
  return {
    path: dirPath,
    exists: await exists(dirPath),
  };
}

export async function revealWorkspaceModesDataDir(): Promise<{
  status: string;
}> {
  const dirPath = getWorkspaceModesDataDirPath();
  await fs.mkdir(dirPath, { recursive: true });

  const platform = process.platform;
  if (platform === "win32") {
    const { spawn } = await import("node:child_process");
    spawn("explorer", [dirPath], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "darwin") {
    const { spawn } = await import("node:child_process");
    spawn("open", [dirPath], { detached: true, stdio: "ignore" }).unref();
  } else {
    const { spawn } = await import("node:child_process");
    spawn("xdg-open", [dirPath], { detached: true, stdio: "ignore" }).unref();
  }

  return { status: "ok" };
}

export async function getStoredProjectDataSnapshot(
  projectPath: string | null,
): Promise<StoredProjectData> {
  const resolvedProjectPath = getProjectPathOrThrow(projectPath);
  return readStoredProjectData(resolvedProjectPath);
}
