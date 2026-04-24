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
  extraFeatures: {},
};

const DEFAULT_MODES: Mode[] = [
  {
    id: "review",
    name: "Review",
    systemPrompt:
      "Du bist ein hilfreicher Schreibassistent. Analysiere den Text klar, konkret und konstruktiv.",
    autoIncludes: [],
    color: "#7c3aed",
    useReasoning: false,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    systemPrompt:
      "Du bist ein kreativer Sparringspartner. Liefere Ideen, Alternativen und neue Richtungen.",
    autoIncludes: [],
    color: "#059669",
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
  return {
    name: input?.name ?? "",
    description: input?.description ?? "",
    alwaysInclude: Array.isArray(input?.alwaysInclude)
      ? input.alwaysInclude
      : [],
    defaultMode: input?.defaultMode ?? "",
    workspaceMode: input?.workspaceMode ?? "default",
    quickChatLlmId: input?.quickChatLlmId ?? "",
    ...(maxToolRounds !== undefined ? { maxToolRounds } : {}),
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
