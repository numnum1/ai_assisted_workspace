import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const ASSISTANT_DIR = ".assistant";
const PROJECT_CONFIG_FILE = "project.json";
const MODES_FILE = "modes.json";
const AGENTS_FILE = "agents.json";
const WORKSPACE_MODE_PLUGINS_DIR = "workspace-modes";
const BUILTIN_WORKSPACE_MODES = [
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
const DEFAULT_PROJECT_CONFIG = {
    name: "",
    description: "",
    alwaysInclude: [],
    defaultMode: "",
    workspaceMode: "default",
    quickChatLlmId: "",
    extraFeatures: {},
};
const DEFAULT_MODES = [
    {
        id: "review",
        name: "Review",
        systemPrompt: "Du bist ein hilfreicher Schreibassistent. Analysiere den Text klar, konkret und konstruktiv.",
        autoIncludes: [],
        color: "#7c3aed",
        useReasoning: false,
    },
    {
        id: "brainstorm",
        name: "Brainstorm",
        systemPrompt: "Du bist ein kreativer Sparringspartner. Liefere Ideen, Alternativen und neue Richtungen.",
        autoIncludes: [],
        color: "#059669",
        useReasoning: false,
    },
];
async function exists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
function getProjectPathOrThrow(projectPath) {
    if (!projectPath) {
        throw new Error("No project is currently open.");
    }
    return projectPath;
}
function getAssistantDir(projectPath) {
    return path.join(projectPath, ASSISTANT_DIR);
}
function getProjectConfigPath(projectPath) {
    return path.join(getAssistantDir(projectPath), PROJECT_CONFIG_FILE);
}
function getModesPath(projectPath) {
    return path.join(getAssistantDir(projectPath), MODES_FILE);
}
function getAgentsPath(projectPath) {
    return path.join(getAssistantDir(projectPath), AGENTS_FILE);
}
function getWorkspaceModesDataDirPath() {
    return path.join(os.homedir(), ".writing-assistant", WORKSPACE_MODE_PLUGINS_DIR);
}
async function ensureAssistantDir(projectPath) {
    await fs.mkdir(getAssistantDir(projectPath), { recursive: true });
}
async function readJsonFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function writeJsonFile(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
function normalizeProjectConfig(input) {
    return {
        name: input?.name ?? "",
        description: input?.description ?? "",
        alwaysInclude: Array.isArray(input?.alwaysInclude)
            ? input.alwaysInclude
            : [],
        defaultMode: input?.defaultMode ?? "",
        workspaceMode: input?.workspaceMode ?? "default",
        quickChatLlmId: input?.quickChatLlmId ?? "",
        extraFeatures: input?.extraFeatures ?? {},
    };
}
function normalizeMode(input) {
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
function normalizeAgent(input) {
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
async function readStoredProjectData(projectPath) {
    const [config, modes, agents] = await Promise.all([
        readJsonFile(getProjectConfigPath(projectPath)),
        readJsonFile(getModesPath(projectPath)),
        readJsonFile(getAgentsPath(projectPath)),
    ]);
    return {
        config: config ?? undefined,
        modes: modes ?? undefined,
        agents: agents ?? undefined,
    };
}
async function loadUserWorkspaceModes() {
    const dataDir = getWorkspaceModesDataDirPath();
    if (!(await exists(dataDir))) {
        return [];
    }
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => path.join(dataDir, entry.name));
    const modes = await Promise.all(files.map(async (filePath) => {
        const mode = await readJsonFile(filePath);
        return mode;
    }));
    return modes.filter((mode) => {
        return (!!mode && typeof mode.id === "string" && typeof mode.name === "string");
    });
}
async function getAllWorkspaceModeSchemas() {
    const userModes = await loadUserWorkspaceModes();
    const byId = new Map();
    for (const mode of BUILTIN_WORKSPACE_MODES) {
        byId.set(mode.id, mode);
    }
    for (const mode of userModes) {
        byId.set(mode.id, mode);
    }
    return [...byId.values()];
}
export async function getProjectConfigStatus(projectPath) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    return {
        initialized: await exists(getAssistantDir(resolvedProjectPath)),
    };
}
export async function initProjectConfig(projectPath) {
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
export async function getProjectConfig(projectPath) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    const stored = await readJsonFile(getProjectConfigPath(resolvedProjectPath));
    return normalizeProjectConfig(stored ?? DEFAULT_PROJECT_CONFIG);
}
export async function updateProjectConfig(projectPath, config) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    await ensureAssistantDir(resolvedProjectPath);
    const normalized = normalizeProjectConfig(config);
    await writeJsonFile(getProjectConfigPath(resolvedProjectPath), normalized);
    return normalized;
}
export async function getProjectModes(projectPath) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    const stored = await readJsonFile(getModesPath(resolvedProjectPath));
    const modes = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_MODES;
    return modes.map(normalizeMode);
}
export async function saveProjectMode(projectPath, id, mode) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    await ensureAssistantDir(resolvedProjectPath);
    const modes = await getProjectModes(resolvedProjectPath);
    const normalized = normalizeMode({ ...mode, id });
    const next = modes.filter((entry) => entry.id !== id);
    next.push(normalized);
    next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    await writeJsonFile(getModesPath(resolvedProjectPath), next);
    return normalized;
}
export async function deleteProjectMode(projectPath, id) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    const modes = await getProjectModes(resolvedProjectPath);
    const next = modes.filter((entry) => entry.id !== id);
    await writeJsonFile(getModesPath(resolvedProjectPath), next);
    return { status: "ok" };
}
export async function listProjectAgents(projectPath) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    const stored = await readJsonFile(getAgentsPath(resolvedProjectPath));
    return Array.isArray(stored) ? stored.map(normalizeAgent) : [];
}
export async function saveProjectAgent(projectPath, id, preset) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    await ensureAssistantDir(resolvedProjectPath);
    const agents = await listProjectAgents(resolvedProjectPath);
    const normalized = normalizeAgent({ ...preset, id });
    const next = agents.filter((entry) => entry.id !== id);
    next.push(normalized);
    next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    await writeJsonFile(getAgentsPath(resolvedProjectPath), next);
    return normalized;
}
export async function deleteProjectAgent(projectPath, id) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    const agents = await listProjectAgents(resolvedProjectPath);
    const next = agents.filter((entry) => entry.id !== id);
    await writeJsonFile(getAgentsPath(resolvedProjectPath), next);
    return { status: "ok" };
}
export async function getWorkspaceMode(_projectPath, modeId) {
    const resolvedId = modeId?.trim() || "default";
    const allModes = await getAllWorkspaceModeSchemas();
    const found = allModes.find((mode) => mode.id === resolvedId);
    if (!found) {
        throw new Error(`Workspace mode not found: ${resolvedId}`);
    }
    return found;
}
export async function listWorkspaceModes(_projectPath) {
    const userModes = await loadUserWorkspaceModes();
    const builtinIds = new Set(BUILTIN_WORKSPACE_MODES.map((mode) => mode.id));
    const merged = [...BUILTIN_WORKSPACE_MODES, ...userModes];
    const deduped = new Map();
    for (const mode of merged) {
        deduped.set(mode.id, mode);
    }
    return [...deduped.values()]
        .map((mode) => ({
        id: mode.id,
        name: mode.name,
        source: builtinIds.has(mode.id)
            ? "builtin"
            : "user",
        icon: mode.icon ?? "Folder",
        mediaType: mode.mediaType === true,
    }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
export async function getWorkspaceModesDataDir() {
    const dirPath = getWorkspaceModesDataDirPath();
    return {
        path: dirPath,
        exists: await exists(dirPath),
    };
}
export async function revealWorkspaceModesDataDir() {
    const dirPath = getWorkspaceModesDataDirPath();
    await fs.mkdir(dirPath, { recursive: true });
    const platform = process.platform;
    if (platform === "win32") {
        const { spawn } = await import("node:child_process");
        spawn("explorer", [dirPath], { detached: true, stdio: "ignore" }).unref();
    }
    else if (platform === "darwin") {
        const { spawn } = await import("node:child_process");
        spawn("open", [dirPath], { detached: true, stdio: "ignore" }).unref();
    }
    else {
        const { spawn } = await import("node:child_process");
        spawn("xdg-open", [dirPath], { detached: true, stdio: "ignore" }).unref();
    }
    return { status: "ok" };
}
export async function getStoredProjectDataSnapshot(projectPath) {
    const resolvedProjectPath = getProjectPathOrThrow(projectPath);
    return readStoredProjectData(resolvedProjectPath);
}
//# sourceMappingURL=projectConfigService.js.map