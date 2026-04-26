import type {
  AgentPreset,
  FileNode,
  Mode,
  ChatRequest,
  ChatMessage,
  GitStatus,
  GitCommit,
  GitSyncStatus,
  ProjectConfig,
  ChapterSummary,
  ChapterNode,
  SceneNode,
  ActionNode,
  NodeMeta,
  WorkspaceModeSchema,
  WorkspaceModeInfo,
  LlmPublic,
  LlmsListResponse,
  Conversation,
} from "./types.ts";
import type {
  ChatStreamEvent,
  FileContentResult as ElectronFileContentResult,
} from "./electron/bridge.ts";

type GlossaryEntryDto = { term: string; definition: string };

type GlossaryApiResponse = {
  content: string;
  exists: boolean;
  prefixMarkdown?: string;
  entries?: GlossaryEntryDto[];
};
import {
  buildConversationById,
  effectiveSavedToProject,
} from "./components/chat/chatHistoryUtils.ts";
import { getAppBridge } from "./electron/bridge.ts";

type FileContentResponse = { path: string; content: string; lines: number };
type FileMutationResponse = { status: string; path: string };
type ProjectCurrentResponse = {
  path: string;
  hasProject: boolean;
  initialized: boolean;
};
type ProjectBrowseResponse = { cancelled: boolean; path?: string };
type ProjectOpenResponse = {
  status: string;
  path: string;
  tree: FileNode;
  initialized: boolean;
};
type ProjectConfigStatusResponse = { initialized: boolean };
type SearchHitResponse = {
  path: string;
  line: number;
  preview: string;
};
type SearchResponse = {
  hits: SearchHitResponse[];
};
type TypedFileContentResponse = {
  data: Record<string, unknown>;
};
type TypedFileFillResponse = {
  data?: Record<string, unknown>;
  error?: string;
};
type SnapshotResponse = {
  id: string;
  path: string;
  oldContent: string;
  wasNew: boolean;
};
type SnapshotApplyResponse = { status: string };
type SnapshotRevertResponse = {
  status: string;
  path: string;
  wasNew: boolean;
};

function getElectronApi() {
  return getAppBridge();
}

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

function rethrowGitAuthFromElectron(err: unknown): never {
  if (err instanceof Error && err.message === "auth_required") {
    throw new AuthRequiredError();
  }
  throw err instanceof Error ? err : new Error(String(err));
}

async function invokeGitBridge<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    rethrowGitAuthFromElectron(e);
  }
}

export const filesApi = {
  getTree: async (): Promise<FileNode> => {
    const api = getElectronApi();
    if (api?.files) return api.files.getTree();
    throw new Error("Electron bridge not available");
  },
  getContent: async (path: string): Promise<FileContentResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.getContent(path);
    throw new Error("Electron bridge not available");
  },
  saveContent: async (
    path: string,
    content: string,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.files) return api.files.saveContent(path, content);
    throw new Error("Electron bridge not available");
  },
  deleteContent: async (path: string): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.deleteContent(path);
    throw new Error("Electron bridge not available");
  },
  createFile: async (
    parentPath: string,
    name: string,
  ): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.createFile(parentPath, name);
    throw new Error("Electron bridge not available");
  },
  createFolder: async (
    parentPath: string,
    name: string,
  ): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.createFolder(parentPath, name);
    throw new Error("Electron bridge not available");
  },
  rename: async (
    path: string,
    newName: string,
  ): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.rename(path, newName);
    throw new Error("Electron bridge not available");
  },
  move: async (
    path: string,
    targetParentPath: string,
  ): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.move(path, targetParentPath);
    throw new Error("Electron bridge not available");
  },
};

/** Persisted chat subset for Git sync (see useChatHistory) */
export const PROJECT_CHAT_HISTORY_PATH = ".assistant/chat-history.json";

/** Load project-stored chats; returns null if missing or unreadable */
export async function fetchProjectChatHistory(): Promise<
  Conversation[] | null
> {
  try {
    const data = await filesApi.getContent(PROJECT_CHAT_HISTORY_PATH);
    if (typeof data.content !== "string") return null;
    const parsed = JSON.parse(data.content) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Conversation[];
  } catch {
    return null;
  }
}

/** Writes roots with `savedToProject` plus any threads whose parent chain is pinned. */
export async function persistProjectChatHistory(
  conversations: Conversation[],
): Promise<void> {
  const byId = buildConversationById(conversations);
  const payload = conversations.filter((c) => effectiveSavedToProject(c, byId));
  await filesApi.saveContent(
    PROJECT_CHAT_HISTORY_PATH,
    JSON.stringify(payload),
  );
}

export const modesApi = {
  getAll: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getModes();
    throw new Error("Electron bridge not available");
  },
};

export const projectApi = {
  current: async (): Promise<ProjectCurrentResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.current();
    throw new Error("Electron bridge not available");
  },
  reveal: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.project) return api.project.reveal();
    throw new Error("Electron bridge not available");
  },
  browse: async (): Promise<ProjectBrowseResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.browse();
    throw new Error("Electron bridge not available");
  },
  open: async (path: string): Promise<ProjectOpenResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.open(path);
    throw new Error("Electron bridge not available");
  },
};

export const projectConfigApi = {
  status: async (): Promise<ProjectConfigStatusResponse> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.status();
    throw new Error("Electron bridge not available");
  },
  getWorkspaceMode: async (
    modeId?: string | null,
  ): Promise<WorkspaceModeSchema> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getWorkspaceMode(modeId);
    throw new Error("Electron bridge not available");
  },
  listWorkspaceModes: async (): Promise<WorkspaceModeInfo[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.listWorkspaceModes();
    throw new Error("Electron bridge not available");
  },
  getWorkspaceModesDataDir: async (): Promise<{
    path: string;
    exists: boolean;
  }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getWorkspaceModesDataDir();
    throw new Error("Electron bridge not available");
  },
  revealWorkspaceModesDataDir: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.revealWorkspaceModesDataDir();
    throw new Error("Electron bridge not available");
  },
  get: async (): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.get();
    throw new Error("Electron bridge not available");
  },
  init: async (): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.init();
    throw new Error("Electron bridge not available");
  },
  update: async (config: ProjectConfig): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.update(config);
    throw new Error("Electron bridge not available");
  },
  getModes: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getModes();
    throw new Error("Electron bridge not available");
  },
  saveMode: async (id: string, mode: Mode): Promise<Mode> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.saveMode(id, mode);
    throw new Error("Electron bridge not available");
  },
  deleteMode: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.deleteMode(id);
    throw new Error("Electron bridge not available");
  },
  listAgents: async (): Promise<AgentPreset[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.listAgents();
    throw new Error("Electron bridge not available");
  },
  saveAgent: async (id: string, preset: AgentPreset): Promise<AgentPreset> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.saveAgent(id, preset);
    throw new Error("Electron bridge not available");
  },
  deleteAgent: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.deleteAgent(id);
    throw new Error("Electron bridge not available");
  },
};

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

export const llmApi = {
  list: async (): Promise<LlmsListResponse> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.list();
    throw new Error("Electron bridge not available");
  },
  create: async (body: LlmCreateRequest): Promise<LlmPublic> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.create(body);
    throw new Error("Electron bridge not available");
  },
  update: async (id: string, body: LlmUpdateRequest): Promise<LlmPublic> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.update(id, body);
    throw new Error("Electron bridge not available");
  },
  remove: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.remove(id);
    throw new Error("Electron bridge not available");
  },
};

export const gitApi = {
  status: async (): Promise<GitStatus> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.status());
    throw new Error("Electron bridge not available");
  },
  commit: async (
    message: string,
    files?: string[],
  ): Promise<{ hash: string; message: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.commit(message, files));
    throw new Error("Electron bridge not available");
  },
  revertFile: async (
    path: string,
    untracked: boolean,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.revertFile(path, untracked));
    throw new Error("Electron bridge not available");
  },
  revertDirectory: async (path: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.revertDirectory(path));
    throw new Error("Electron bridge not available");
  },
  diff: async (): Promise<{ diff: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.diff());
    throw new Error("Electron bridge not available");
  },
  log: async (limit = 20): Promise<GitCommit[]> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.log(limit));
    throw new Error("Electron bridge not available");
  },
  init: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.init());
    throw new Error("Electron bridge not available");
  },
  aheadBehind: async (): Promise<GitSyncStatus> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.aheadBehind());
    throw new Error("Electron bridge not available");
  },
  sync: async (): Promise<{ action: string; details: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.sync());
    throw new Error("Electron bridge not available");
  },
  setCredentials: async (
    username: string,
    token: string,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.setCredentials(username, token));
    throw new Error("Electron bridge not available");
  },
  fileHistory: async (path: string): Promise<GitCommit[]> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.fileHistory(path));
    throw new Error("Electron bridge not available");
  },
  fileAtCommit: async (
    path: string,
    hash: string,
  ): Promise<{
    path: string;
    hash: string;
    content: string;
    exists: boolean;
  }> => {
    const api = getElectronApi();
    if (api?.git) return invokeGitBridge(() => api.git!.fileAtCommit(path, hash));
    throw new Error("Electron bridge not available");
  },
};

export const chapterApi = {
  list: async (
    structureRoot?: string | null,
  ): Promise<ChapterSummary[]> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.list(structureRoot);
    throw new Error("Electron bridge not available");
  },
  getStructure: async (
    id: string,
    structureRoot?: string | null,
  ): Promise<ChapterNode> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.getStructure(id, structureRoot);
    throw new Error("Electron bridge not available");
  },
  create: async (
    title: string,
    structureRoot?: string | null,
  ): Promise<ChapterSummary> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.create(title, structureRoot);
    throw new Error("Electron bridge not available");
  },
  updateMeta: async (
    chapterId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.updateMeta(chapterId, meta, structureRoot);
    throw new Error("Electron bridge not available");
  },
  delete: async (
    chapterId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.delete(chapterId, structureRoot);
    throw new Error("Electron bridge not available");
  },

  createScene: async (
    chapterId: string,
    title: string,
    structureRoot?: string | null,
  ): Promise<SceneNode> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.createScene(chapterId, title, structureRoot);
    throw new Error("Electron bridge not available");
  },
  updateSceneMeta: async (
    chapterId: string,
    sceneId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.updateSceneMeta(chapterId, sceneId, meta, structureRoot);
    throw new Error("Electron bridge not available");
  },
  deleteScene: async (
    chapterId: string,
    sceneId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.deleteScene(chapterId, sceneId, structureRoot);
    throw new Error("Electron bridge not available");
  },

  createAction: async (
    chapterId: string,
    sceneId: string,
    title: string,
    structureRoot?: string | null,
  ): Promise<ActionNode> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.createAction(chapterId, sceneId, title, structureRoot);
    throw new Error("Electron bridge not available");
  },
  updateActionMeta: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.updateActionMeta(chapterId, sceneId, actionId, meta, structureRoot);
    throw new Error("Electron bridge not available");
  },
  deleteAction: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.deleteAction(chapterId, sceneId, actionId, structureRoot);
    throw new Error("Electron bridge not available");
  },

  getActionContent: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ content: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.getActionContent(chapterId, sceneId, actionId, structureRoot);
    throw new Error("Electron bridge not available");
  },
  saveActionContent: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    content: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.saveActionContent(chapterId, sceneId, actionId, content, structureRoot);
    throw new Error("Electron bridge not available");
  },

  reorderScenes: async (
    chapterId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.reorderScenes(chapterId, ids, structureRoot);
    throw new Error("Electron bridge not available");
  },
  reorderActions: async (
    chapterId: string,
    sceneId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.reorderActions(chapterId, sceneId, ids, structureRoot);
    throw new Error("Electron bridge not available");
  },

  randomizeIds: async (
    structureRoot?: string | null,
  ): Promise<{ renamed: number }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.randomizeIds(structureRoot);
    throw new Error("Electron bridge not available");
  },
};

export const bookApi = {
  getMeta: async (structureRoot?: string | null): Promise<NodeMeta> => {
    const api = getElectronApi();
    if (api?.book) return api.book.getMeta(structureRoot);
    throw new Error("Electron bridge not available");
  },
  updateMeta: async (
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.book) return api.book.updateMeta(meta, structureRoot);
    throw new Error("Electron bridge not available");
  },
};

export const subprojectApi = {
  info: async (
    path: string,
  ): Promise<{ subproject: boolean; type?: string; name?: string }> => {
    const api = getElectronApi();
    if (api?.subproject) return api.subproject.info(path);
    throw new Error("Electron bridge not available");
  },
  init: async (
    path: string,
    type: string,
    name: string,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.subproject) return api.subproject.init(path, type, name);
    throw new Error("Electron bridge not available");
  },
  remove: async (path: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.subproject) return api.subproject.remove(path);
    throw new Error("Electron bridge not available");
  },
};

export const wikiApi = {
  listFiles: async (): Promise<string[]> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.listFiles();
    throw new Error("Electron bridge not available");
  },
  search: async (
    q: string,
    limit?: number,
  ): Promise<Array<{ path: string; title: string; snippet: string }>> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.search(q, limit);
    throw new Error("Electron bridge not available");
  },
};

export const glossaryApi = {
  get: async (): Promise<GlossaryApiResponse> => {
    const api = getElectronApi();
    if (api?.glossary) return api.glossary.get();
    throw new Error("Electron bridge not available");
  },
  addEntry: async (
    term: string,
    definition: string,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.glossary) return api.glossary.addEntry(term, definition);
    throw new Error("Electron bridge not available");
  },
  deleteEntry: async (term: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.glossary) return api.glossary.deleteEntry(term);
    throw new Error("Electron bridge not available");
  },
};

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export const searchApi = {
  query: async (query: string, limit = 200): Promise<SearchResponse> => {
    const api = getElectronApi();
    if (api?.search) return api.search.query(query, limit);
    throw new Error("Electron bridge not available");
  },
};

export type VectorIndexStatus = {
  indexed: boolean;
  indexedAt: string | null;
  chunkCount: number;
  embeddingModel: string | null;
};

export const vectorApi = {
  status: async (): Promise<VectorIndexStatus> => {
    const api = getElectronApi();
    if (api?.vector) return api.vector.status();
    throw new Error("Electron bridge not available");
  },
  index: async (): Promise<VectorIndexStatus> => {
    const api = getElectronApi();
    if (api?.vector) return api.vector.index();
    throw new Error("Electron bridge not available");
  },
};

export const typedFilesApi = {
  getContent: async (path: string): Promise<TypedFileContentResponse> => {
    const api = getElectronApi();
    if (api?.typedFiles) return api.typedFiles.getContent(path);
    throw new Error("Electron bridge not available");
  },
  saveContent: async (
    path: string,
    data: Record<string, unknown>,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.typedFiles) return api.typedFiles.saveContent(path, data);
    throw new Error("Electron bridge not available");
  },
  fill: async (path: string): Promise<TypedFileFillResponse> => {
    const api = getElectronApi();
    if (api?.typedFiles) return api.typedFiles.fill(path);
    throw new Error("Electron bridge not available");
  },
};

export const snapshotsApi = {
  get: async (id: string): Promise<SnapshotResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.get(id);
    throw new Error("Electron bridge not available");
  },
  apply: async (id: string): Promise<SnapshotApplyResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.apply(id);
    throw new Error("Electron bridge not available");
  },
  revert: async (id: string): Promise<SnapshotRevertResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.revert(id);
    throw new Error("Electron bridge not available");
  },
};

export async function getFileContentForChangeCard(
  path: string,
): Promise<ElectronFileContentResult> {
  return filesApi.getContent(path);
}

function decodeElectronStreamData(data: string): string {
  return data.replace(/\\n/g, "\n");
}

export const chatApi = {
  previewContext: async (
    body: ChatRequest,
  ): Promise<{
    includedFiles: string[];
    estimatedTokens: number;
    contextBlocks: ContextBlock[];
    systemPrompt: string;
  }> => {
    const bridge = getAppBridge();
    if (bridge?.chat) return bridge.chat.previewContext(body);
    throw new Error(
      "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.",
    );
  },

  summarizeThread: async (
    messages: ChatMessage[],
    focusInstructions?: string | null,
  ): Promise<string> => {
    const focusTrimmed =
      typeof focusInstructions === "string" ? focusInstructions.trim() : "";
    const focusPayload = focusTrimmed.length > 0 ? focusTrimmed : undefined;
    console.trace(
      `[api] summarizeThread: messages=${messages.length}, focus=${focusPayload ? 'yes' : 'no (default)'}`,
    );
    const bridge = getAppBridge();
    if (bridge?.chat) {
      const out = await bridge.chat.summarizeThread({
        messages,
        focusInstructions: focusPayload,
      });
      console.trace(`[api] summarizeThread finished, length=${out.length}`);
      return out;
    }
    throw new Error(
      "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.",
    );
  },
};

/**
 * Yields one macrotask so React 18 can commit state updates between SSE tokens.
 * Without this, many `onToken` calls from a single `reader.read()` chunk are batched into one paint.
 */
function yieldMacrotaskForTokenPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Maps Main-process IPC `chat:streamEvent` payloads `{ streamId, event, data }`
 * to renderer `ChatStreamEvent` `{ type, payload }` expected by `handleStreamEvent`.
 */
function ipcChatStreamPayloadToBridgeEvent(raw: unknown): ChatStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = (r["event"] ?? r["type"]) as string | undefined;
  const data = r["data"];
  if (!type) return null;

  const stringData = typeof data === "string" ? data : null;
  const parseJson = (): unknown => {
    try {
      return typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return null;
    }
  };

  if (
    type === "token" ||
    type === "tool_call" ||
    type === "resolved_user_message"
  ) {
    return { type, payload: stringData ?? "" } as ChatStreamEvent;
  }
  if (
    type === "context" ||
    type === "tool_history" ||
    type === "done" ||
    type === "error" ||
    type === "context_update"
  ) {
    const payload = parseJson();
    if (payload == null) return null;
    return { type, payload } as ChatStreamEvent;
  }
  return null;
}

export function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  onContext: (info: {
    includedFiles: string[];
    estimatedTokens: number;
    maxContextTokens?: number;
  }) => void,
  onDone: (fullAssistantText: string) => void,
  onError: (err: Error) => void,
  onToolCall?: (description: string) => void,
  onContextUpdate?: (estimatedTokens: number) => void,
  onToolHistory?: (messages: import("./types.ts").ChatMessage[]) => void,
  onResolvedUserMessage?: (content: string) => void,
): AbortController {
  const controller = new AbortController();

  const bridge = getAppBridge();
  if (bridge?.chat) {
    const chatBridge = bridge.chat;
    let errorHandled = false;
    let tokenCount = 0;
    let fullAssistantText = "";
    let activeStreamId: string | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      unsubscribe?.();
      unsubscribe = null;
      activeStreamId = null;
    };

    const handleStreamEvent = async (chatEvent: ChatStreamEvent): Promise<void> => {
      if (activeStreamId == null) {
        return;
      }

      if (chatEvent.type === "context") {
        onContext(chatEvent.payload);
      } else if (chatEvent.type === "error") {
        console.warn(
          "[streamChat] Received error event from Electron chat bridge:",
          chatEvent.payload.message,
        );
        onError(new Error(chatEvent.payload.message));
        errorHandled = true;
        cleanup();
      } else if (chatEvent.type === "done") {
        if (!errorHandled) {
          if (tokenCount === 0) {
            console.warn(
              "[streamChat] Electron stream ended (done event) but 0 tokens were received — model returned no content.",
            );
            onError(new Error("MODEL_EMPTY_RESPONSE"));
          } else {
            onDone(chatEvent.payload.fullAssistantText);
          }
        }
        cleanup();
      } else if (chatEvent.type === "tool_call") {
        onToolCall?.(decodeElectronStreamData(chatEvent.payload));
      } else if (chatEvent.type === "tool_history") {
        onToolHistory?.(chatEvent.payload);
      } else if (chatEvent.type === "resolved_user_message") {
        onResolvedUserMessage?.(decodeElectronStreamData(chatEvent.payload));
      } else if (chatEvent.type === "context_update") {
        onContextUpdate?.(chatEvent.payload.estimatedTokens);
      } else if (chatEvent.type === "token") {
        tokenCount++;
        const unescaped = decodeElectronStreamData(chatEvent.payload);
        fullAssistantText += unescaped;
        onToken(unescaped);
        await yieldMacrotaskForTokenPaint();
      }
    };

    void chatBridge
      .startStream(request)
      .then(({ streamId }) => {
        activeStreamId = streamId;

        const subscription = chatBridge.onStreamEvent(streamId, (payload) => {
          const evt = ipcChatStreamPayloadToBridgeEvent(payload);
          if (evt) void handleStreamEvent(evt);
        });
        unsubscribe = () => subscription.unsubscribe();

        controller.signal.addEventListener(
          "abort",
          () => {
            cleanup();
            void chatBridge.stopStream(streamId);
          },
          { once: true },
        );
      })
      .catch((err) => {
        cleanup();
        if (err instanceof Error) {
          onError(err);
          return;
        }
        onError(new Error(String(err)));
      });

    return controller;
  }

  queueMicrotask(() =>
    onError(
      new Error(
        "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann Dev neu starten.",
      ),
    ),
  );
  return controller;
}
