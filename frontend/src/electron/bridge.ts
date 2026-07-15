import type {
  AgentPreset,
  AppPreferences,
  CommentCategoryDef,
  ChatMessage,
  ChatRequest,
  FileNode,
  LlmsListResponse,
  LlmPublic,
  Mode,
  Persona,
  ProjectConfig,
  WorkspaceModeInfo,
  WorkspaceModeSchema,
} from "../types.ts";

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export interface WikiSearchResult {
  path: string;
  title: string;
  snippet: string;
}

export interface SnapshotData {
  id: string;
  path: string;
  oldContent: string;
  wasNew: boolean;
}

export interface SnapshotApplyResult {
  status: string;
}

export interface SnapshotRevertResult {
  status: string;
  path: string;
  wasNew: boolean;
}

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
}

export interface ChatContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
  maxContextTokens?: number;
}

export type ChatStreamEvent =
  | { type: "context"; payload: ChatContextInfo }
  | { type: "token"; payload: string }
  | { type: "tool_call"; payload: string }
  | { type: "tool_history"; payload: ChatMessage[] }
  | { type: "resolved_user_message"; payload: string }
  | { type: "context_update"; payload: { estimatedTokens: number } }
  | { type: "done"; payload: { fullAssistantText: string } }
  | { type: "error"; payload: { message: string } }
  | { type: "navi_state"; payload: { stateId: string; completedStateId?: string; summary?: string } }
  | { type: "navi_tips_covered"; payload: { coveredIds: string[] } }
  | { type: "navi_step"; payload: { label: string | null } }
  | { type: "navi_facts"; payload: import("../types.js").NaviFacts }
  | { type: "navi_trace"; payload: import("../types.js").NaviTraceEntry };

export interface ChatStreamStartResult {
  streamId: string;
}

export interface ChatStreamSubscription {
  unsubscribe: () => void;
}

export interface LlmCreateRequest {
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKey: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export interface LlmUpdateRequest {
  name?: string;
  fastApiUrl?: string;
  fastModel?: string;
  fastApiKey?: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export interface ProjectCurrentResult {
  path: string;
  hasProject: boolean;
  initialized: boolean;
}

export interface ProjectBrowseResult {
  cancelled: boolean;
  path?: string;
}

export interface FileContentResult {
  path: string;
  content: string;
  lines: number;
}

export interface AppBridge {
  platform: NodeJS.Platform;
  isElectron: boolean;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  project?: {
    current: () => Promise<ProjectCurrentResult>;
    reveal: () => Promise<{ status: string }>;
    browse: () => Promise<ProjectBrowseResult>;
    open: (path: string) => Promise<{
      status: string;
      path: string;
      tree: FileNode;
      initialized: boolean;
    }>;
  };
  files?: {
    getContent: (path: string) => Promise<FileContentResult>;
    saveContent: (path: string, content: string) => Promise<{ status: string }>;
  };
  wiki?: {
    listFiles: () => Promise<string[]>;
    search: (q: string, limit?: number) => Promise<WikiSearchResult[]>;
  };
  snapshots?: {
    get: (id: string) => Promise<SnapshotData>;
    apply: (id: string) => Promise<SnapshotApplyResult>;
    revert: (id: string) => Promise<SnapshotRevertResult>;
  };
  chat?: {
    previewContext: (body: ChatRequest) => Promise<ChatContextPreviewResult>;
    startStream: (body: ChatRequest) => Promise<ChatStreamStartResult>;
    stopStream: (streamId: string) => Promise<{ status: string }>;
    summarizeThread: (body: {
      messages: import('../types.ts').ChatMessage[];
      focusInstructions?: string | null;
      parentMessages?: import('../types.ts').ChatMessage[];
    }) => Promise<{ summary: string; title: string }>;
    onStreamEvent: (
      streamId: string,
      listener: (event: ChatStreamEvent) => void,
    ) => ChatStreamSubscription;
  };
  projectConfig?: {
    status: () => Promise<{ initialized: boolean }>;
    getWorkspaceMode: (modeId?: string | null) => Promise<WorkspaceModeSchema>;
    listWorkspaceModes: () => Promise<WorkspaceModeInfo[]>;
    getWorkspaceModesDataDir: () => Promise<{ path: string; exists: boolean }>;
    revealWorkspaceModesDataDir: () => Promise<{ status: string }>;
    get: () => Promise<ProjectConfig>;
    init: () => Promise<ProjectConfig>;
    initFromFile: () => Promise<ProjectConfig | null>;
    update: (config: ProjectConfig) => Promise<ProjectConfig>;
    getModes: () => Promise<Mode[]>;
    saveMode: (id: string, mode: Mode) => Promise<Mode>;
    deleteMode: (id: string) => Promise<{ status: string }>;
    resetModes: () => Promise<Mode[]>;
    getCommentCategories: () => Promise<CommentCategoryDef[]>;
    saveCommentCategory: (
      id: string,
      category: CommentCategoryDef,
    ) => Promise<CommentCategoryDef>;
    deleteCommentCategory: (id: string) => Promise<{ status: string }>;
    resetCommentCategories: () => Promise<CommentCategoryDef[]>;
    listAgents: () => Promise<AgentPreset[]>;
    saveAgent: (id: string, preset: AgentPreset) => Promise<AgentPreset>;
    deleteAgent: (id: string) => Promise<{ status: string }>;
  };
  llms?: {
    list: () => Promise<LlmsListResponse>;
    create: (body: LlmCreateRequest) => Promise<LlmPublic>;
    update: (id: string, body: LlmUpdateRequest) => Promise<LlmPublic>;
    remove: (id: string) => Promise<{ status: string }>;
  };
  simulation?: {
    listBooks: () => Promise<Array<{
      structureRoot: string | null;
      label: string;
      characters: Array<{ wikiPath: string; name: string }>;
    }>>;
    writeResult: (name: string, content: string) => Promise<{ path: string }>;
    readResult: (name: string) => Promise<{ content: string; exists: boolean }>;
    listResults: () => Promise<string[]>;
    generateUserReply: (req: {
      goal: string;
      characterNames?: string[];
      transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
      llmId?: string | null;
    }) => Promise<{ reply: string }>;
    evaluateRun: (req: {
      persona: string;
      personaName?: string;
      transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
      llmId?: string | null;
    }) => Promise<{ score: number; report: string }>;
  };
  persona?: {
    list: () => Promise<Persona[]>;
    read: (id: string) => Promise<{ persona: Persona | null }>;
    write: (name: string, description: string) => Promise<{ persona: Persona }>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
  };
  preferences?: {
    get: () => Promise<AppPreferences>;
    set: (patch: Partial<AppPreferences>) => Promise<AppPreferences>;
  };
  shell?: {
    openDevTools: () => Promise<void>;
  };
  spellcheck?: {
    fixAtCursor: () => Promise<{ status: string }>;
  };
}

export function getAppBridge(): AppBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.appBridge ?? null;
}

export function isRunningInElectron(): boolean {
  return getAppBridge()?.isElectron === true;
}

const PREFS_STORAGE_KEY = "app-preferences";

const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  appearance: {
    fontFamily: "system-ui",
    chatFontSizePx: 14,
    theme: "dark",
  },
};

function loadPrefsFromLocalStorage(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      version: 1,
      appearance: {
        ...DEFAULT_PREFERENCES.appearance,
        ...(parsed.appearance ?? {}),
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePrefsToLocalStorage(prefs: AppPreferences): AppPreferences {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage full or unavailable
  }
  return prefs;
}

export const preferencesApi = {
  get: async (): Promise<AppPreferences> => {
    const bridge = getAppBridge();
    if (bridge?.preferences) {
      return bridge.preferences.get();
    }
    return loadPrefsFromLocalStorage();
  },
  set: async (patch: Partial<AppPreferences>): Promise<AppPreferences> => {
    const bridge = getAppBridge();
    if (bridge?.preferences) {
      return bridge.preferences.set(patch);
    }
    const current = loadPrefsFromLocalStorage();
    const updated: AppPreferences = {
      version: 1,
      appearance: {
        ...current.appearance,
        ...(patch.appearance ?? {}),
      },
    };
    return savePrefsToLocalStorage(updated);
  },
};
