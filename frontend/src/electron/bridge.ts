import type {
  AgentPreset,
  ChatRequest,
  FileNode,
  Mode,
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

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface GlossaryData {
  content: string;
  exists: boolean;
  prefixMarkdown?: string;
  entries?: GlossaryEntry[];
}

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
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

export interface FileMutationResult {
  status: string;
  path: string;
}

export interface SubprojectInfoResult {
  subproject: boolean;
  type?: string;
  name?: string;
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
    getTree: () => Promise<FileNode>;
    getContent: (path: string) => Promise<FileContentResult>;
    saveContent: (path: string, content: string) => Promise<{ status: string }>;
    deleteContent: (path: string) => Promise<FileMutationResult>;
    createFile: (
      parentPath: string,
      name: string,
    ) => Promise<FileMutationResult>;
    createFolder: (
      parentPath: string,
      name: string,
    ) => Promise<FileMutationResult>;
    rename: (path: string, newName: string) => Promise<FileMutationResult>;
    move: (
      path: string,
      targetParentPath: string,
    ) => Promise<FileMutationResult>;
  };
  subproject?: {
    info: (path: string) => Promise<SubprojectInfoResult>;
    init: (
      path: string,
      type: string,
      name: string,
    ) => Promise<{ status: string }>;
    remove: (path: string) => Promise<{ status: string }>;
  };
  wiki?: {
    listFiles: () => Promise<string[]>;
    search: (q: string, limit?: number) => Promise<WikiSearchResult[]>;
  };
  glossary?: {
    get: () => Promise<GlossaryData>;
    addEntry: (term: string, definition: string) => Promise<{ status: string }>;
    deleteEntry: (term: string) => Promise<{ status: string }>;
  };
  chat?: {
    previewContext: (body: ChatRequest) => Promise<ChatContextPreviewResult>;
  };
  projectConfig?: {
    status: () => Promise<{ initialized: boolean }>;
    getWorkspaceMode: (modeId?: string | null) => Promise<WorkspaceModeSchema>;
    listWorkspaceModes: () => Promise<WorkspaceModeInfo[]>;
    getWorkspaceModesDataDir: () => Promise<{ path: string; exists: boolean }>;
    revealWorkspaceModesDataDir: () => Promise<{ status: string }>;
    get: () => Promise<ProjectConfig>;
    init: () => Promise<ProjectConfig>;
    update: (config: ProjectConfig) => Promise<ProjectConfig>;
    getModes: () => Promise<Mode[]>;
    saveMode: (id: string, mode: Mode) => Promise<Mode>;
    deleteMode: (id: string) => Promise<{ status: string }>;
    listAgents: () => Promise<AgentPreset[]>;
    saveAgent: (id: string, preset: AgentPreset) => Promise<AgentPreset>;
    deleteAgent: (id: string) => Promise<{ status: string }>;
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
