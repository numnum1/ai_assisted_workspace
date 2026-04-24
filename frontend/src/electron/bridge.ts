import type {
  ActionNode,
  AgentPreset,
  ChapterNode,
  ChapterSummary,
  ChatMessage,
  ChatRequest,
  FileNode,
  GitCommit,
  GitStatus,
  GitSyncStatus,
  LlmsListResponse,
  LlmPublic,
  Mode,
  NodeMeta,
  ProjectConfig,
  SceneNode,
  WorkspaceModeInfo,
  WorkspaceModeSchema,
} from "../types.ts";

export interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export interface SearchResponse {
  hits: SearchHit[];
}

export interface TypedFileContentResult {
  data: Record<string, unknown>;
}

export interface TypedFileFillResult {
  data: Record<string, unknown>;
}

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
  | { type: "error"; payload: { message: string } };

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
  snapshots?: {
    get: (id: string) => Promise<SnapshotData>;
    apply: (id: string) => Promise<SnapshotApplyResult>;
    revert: (id: string) => Promise<SnapshotRevertResult>;
  };
  chat?: {
    previewContext: (body: ChatRequest) => Promise<ChatContextPreviewResult>;
    startStream: (body: ChatRequest) => Promise<ChatStreamStartResult>;
    stopStream: (streamId: string) => Promise<{ status: string }>;
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
    update: (config: ProjectConfig) => Promise<ProjectConfig>;
    getModes: () => Promise<Mode[]>;
    saveMode: (id: string, mode: Mode) => Promise<Mode>;
    deleteMode: (id: string) => Promise<{ status: string }>;
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
  search?: {
    query: (q: string, limit?: number) => Promise<SearchResponse>;
  };
  vector?: {
    status: () => Promise<{
      indexed: boolean;
      indexedAt: string | null;
      chunkCount: number;
      embeddingModel: string | null;
    }>;
    index: () => Promise<{
      indexed: boolean;
      indexedAt: string | null;
      chunkCount: number;
      embeddingModel: string | null;
    }>;
  };
  git?: {
    status: () => Promise<GitStatus>;
    commit: (
      message: string,
      files?: string[],
    ) => Promise<{ hash: string; message: string }>;
    revertFile: (path: string, untracked: boolean) => Promise<{ status: string }>;
    revertDirectory: (path: string) => Promise<{ status: string }>;
    diff: () => Promise<{ diff: string }>;
    log: (limit?: number) => Promise<GitCommit[]>;
    init: () => Promise<{ status: string }>;
    aheadBehind: () => Promise<GitSyncStatus>;
    sync: () => Promise<{ action: string; details: string }>;
    setCredentials: (username: string, token: string) => Promise<{ status: string }>;
    fileHistory: (path: string) => Promise<GitCommit[]>;
    fileAtCommit: (
      path: string,
      hash: string,
    ) => Promise<{ path: string; hash: string; content: string; exists: boolean }>;
  };
  chapter?: {
    list: (structureRoot?: string | null) => Promise<ChapterSummary[]>;
    getStructure: (
      chapterId: string,
      structureRoot?: string | null,
    ) => Promise<ChapterNode>;
    create: (
      title: string,
      structureRoot?: string | null,
    ) => Promise<ChapterSummary>;
    updateMeta: (
      chapterId: string,
      meta: NodeMeta,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    delete: (
      chapterId: string,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    createScene: (
      chapterId: string,
      title: string,
      structureRoot?: string | null,
    ) => Promise<SceneNode>;
    updateSceneMeta: (
      chapterId: string,
      sceneId: string,
      meta: NodeMeta,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    deleteScene: (
      chapterId: string,
      sceneId: string,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    createAction: (
      chapterId: string,
      sceneId: string,
      title: string,
      structureRoot?: string | null,
    ) => Promise<ActionNode>;
    updateActionMeta: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      meta: NodeMeta,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    deleteAction: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    getActionContent: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) => Promise<{ content: string }>;
    saveActionContent: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      content: string,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    reorderScenes: (
      chapterId: string,
      ids: string[],
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    reorderActions: (
      chapterId: string,
      sceneId: string,
      ids: string[],
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
    randomizeIds: (
      structureRoot?: string | null,
    ) => Promise<{ renamed: number }>;
  };
  book?: {
    getMeta: (structureRoot?: string | null) => Promise<NodeMeta>;
    updateMeta: (
      meta: NodeMeta,
      structureRoot?: string | null,
    ) => Promise<{ status: string }>;
  };
  typedFiles?: {
    getContent: (path: string) => Promise<TypedFileContentResult>;
    saveContent: (
      path: string,
      data: Record<string, unknown>,
    ) => Promise<{ status: string }>;
    fill: (path: string) => Promise<TypedFileFillResult>;
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
