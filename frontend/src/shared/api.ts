import type {
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
  ChapterComment,
  ChapterFilePaths,
  CommentCategoryDef,
  SceneNode,
  ActionNode,
  NodeMeta,
  WorkspaceModeSchema,
  WorkspaceModeInfo,
  LlmPublic,
  LlmsListResponse,
  Conversation,
  ArcData,
  ArcCoverage,
} from "./types.ts";
import type { StoryboardData } from "./types.ts";
import type { EventRecord, EventStatus } from "./types.ts";
import type { FileContentResult as ElectronFileContentResult } from "./electron/bridge.ts";
import {
  buildConversationById,
  effectiveSavedToProject,
} from "./components/chat/chatHistoryUtils.ts";
import { getAppBridge } from "./electron/bridge.ts";
import { aiService } from "./services/ai/aiService.ts";

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
  copy: async (path: string): Promise<FileMutationResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.copy(path);
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
    if (api?.projectConfig)
      return api.projectConfig.revealWorkspaceModesDataDir();
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
  initFromFile: async (): Promise<ProjectConfig | null> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.initFromFile();
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
  resetModes: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.resetModes();
    throw new Error("Electron bridge not available");
  },
  getCommentCategories: async (): Promise<CommentCategoryDef[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getCommentCategories();
    throw new Error("Electron bridge not available");
  },
  saveCommentCategory: async (
    id: string,
    category: CommentCategoryDef,
  ): Promise<CommentCategoryDef> => {
    const api = getElectronApi();
    if (api?.projectConfig)
      return api.projectConfig.saveCommentCategory(id, category);
    throw new Error("Electron bridge not available");
  },
  deleteCommentCategory: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig)
      return api.projectConfig.deleteCommentCategory(id);
    throw new Error("Electron bridge not available");
  },
  resetCommentCategories: async (): Promise<CommentCategoryDef[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.resetCommentCategories();
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
    if (api?.git)
      return invokeGitBridge(() => api.git!.revertFile(path, untracked));
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
    if (api?.git)
      return invokeGitBridge(() => api.git!.setCredentials(username, token));
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
    if (api?.git)
      return invokeGitBridge(() => api.git!.fileAtCommit(path, hash));
    throw new Error("Electron bridge not available");
  },
};

export const chapterApi = {
  list: async (structureRoot?: string | null): Promise<ChapterSummary[]> => {
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
  getFilePaths: async (
    id: string,
    structureRoot?: string | null,
  ): Promise<ChapterFilePaths> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.getFilePaths(id, structureRoot);
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
    if (api?.chapter)
      return api.chapter.updateMeta(chapterId, meta, structureRoot);
    throw new Error("Electron bridge not available");
  },
  getComments: async (
    chapterId: string,
    structureRoot?: string | null,
  ): Promise<ChapterComment[]> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.getComments(chapterId, structureRoot);
    throw new Error("Electron bridge not available");
  },
  saveComments: async (
    chapterId: string,
    comments: ChapterComment[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.saveComments(chapterId, comments, structureRoot);
    throw new Error("Electron bridge not available");
  },
  generateComments: async (
    chapterId: string,
    chapterText: string,
    categories: Pick<CommentCategoryDef, 'id' | 'promptFragment'>[],
    freeText: string,
    llmId?: string | null,
    structureRoot?: string | null,
  ): Promise<ChapterComment[]> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.generateComments(
        chapterId,
        chapterText,
        categories,
        freeText,
        llmId,
        structureRoot,
      );
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
    if (api?.chapter)
      return api.chapter.createScene(chapterId, title, structureRoot);
    throw new Error("Electron bridge not available");
  },
  updateSceneMeta: async (
    chapterId: string,
    sceneId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.updateSceneMeta(
        chapterId,
        sceneId,
        meta,
        structureRoot,
      );
    throw new Error("Electron bridge not available");
  },
  deleteScene: async (
    chapterId: string,
    sceneId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.deleteScene(chapterId, sceneId, structureRoot);
    throw new Error("Electron bridge not available");
  },

  createAction: async (
    chapterId: string,
    sceneId: string,
    title: string,
    structureRoot?: string | null,
  ): Promise<ActionNode> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.createAction(chapterId, sceneId, title, structureRoot);
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
    if (api?.chapter)
      return api.chapter.updateActionMeta(
        chapterId,
        sceneId,
        actionId,
        meta,
        structureRoot,
      );
    throw new Error("Electron bridge not available");
  },
  deleteAction: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.deleteAction(
        chapterId,
        sceneId,
        actionId,
        structureRoot,
      );
    throw new Error("Electron bridge not available");
  },

  getActionContent: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ content: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.getActionContent(
        chapterId,
        sceneId,
        actionId,
        structureRoot,
      );
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
    if (api?.chapter)
      return api.chapter.saveActionContent(
        chapterId,
        sceneId,
        actionId,
        content,
        structureRoot,
      );
    throw new Error("Electron bridge not available");
  },

  reorderChapters: async (
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter) return api.chapter.reorderChapters(ids, structureRoot);
    throw new Error("Electron bridge not available");
  },
  reorderScenes: async (
    chapterId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.reorderScenes(chapterId, ids, structureRoot);
    throw new Error("Electron bridge not available");
  },
  reorderActions: async (
    chapterId: string,
    sceneId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.chapter)
      return api.chapter.reorderActions(chapterId, sceneId, ids, structureRoot);
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
  listFolders: async (): Promise<string[]> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.listFolders();
    throw new Error("Electron bridge not available");
  },
  createFolder: async (parentPath: string, name: string): Promise<{ path: string }> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.createFolder(parentPath, name);
    throw new Error("Electron bridge not available");
  },
  createFile: async (parentPath: string, name: string): Promise<{ path: string }> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.createFile(parentPath, name);
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
  /** The metafile (wiki entry) linked to a structure node or timeline element, or null. */
  getAttachedNote: async (
    ownerRef: string,
  ): Promise<{ path: string; name: string; summary: string } | null> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.getAttachedNote(ownerRef);
    throw new Error("Electron bridge not available");
  },
  /** Ensure a metafile exists for the given owner and return its path (idempotent). */
  createAttachedNote: async (
    ownerRef: string,
    title: string,
  ): Promise<{ path: string }> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.createAttachedNote(ownerRef, title);
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

export const arcApi = {
  read: async (): Promise<ArcData> => {
    const api = getElectronApi();
    if (api?.arcs) return api.arcs.read();
    throw new Error("Electron bridge not available");
  },
  write: async (data: ArcData): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.arcs) return api.arcs.write(data);
    throw new Error("Electron bridge not available");
  },
  coverage: async (): Promise<ArcCoverage> => {
    const api = getElectronApi();
    if (api?.arcs) return api.arcs.coverage();
    throw new Error("Electron bridge not available");
  },
};

export const storyboardApi = {
  read: async (): Promise<StoryboardData> => {
    const api = getElectronApi();
    if (api?.storyboard) return api.storyboard.read();
    throw new Error("Electron bridge not available");
  },
  write: async (data: StoryboardData): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.storyboard) return api.storyboard.write(data);
    throw new Error("Electron bridge not available");
  },
  openWindow: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.storyboard) return api.storyboard.openWindow();
    throw new Error("Electron bridge not available");
  },
};

export const eventsApi = {
  list: async (): Promise<EventRecord[]> => {
    const api = getElectronApi();
    if (api?.events) return api.events.list();
    throw new Error("Electron bridge not available");
  },
  create: async (title: string, summary: string): Promise<EventRecord> => {
    const api = getElectronApi();
    if (api?.events) return api.events.create(title, summary);
    throw new Error("Electron bridge not available");
  },
  update: async (
    id: string,
    patch: { title?: string; summary?: string; status?: EventStatus },
  ): Promise<EventRecord> => {
    const api = getElectronApi();
    if (api?.events) return api.events.update(id, patch);
    throw new Error("Electron bridge not available");
  },
  delete: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.events) return api.events.delete(id);
    throw new Error("Electron bridge not available");
  },
  openWindow: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.events) return api.events.openWindow();
    throw new Error("Electron bridge not available");
  },
};

export const windowApi = {
  open: async (
    kind: "book" | "storyboard" | "chat" | "events",
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.window) return api.window.open(kind);
    throw new Error("Electron bridge not available");
  },
  onWorkspaceChanged: (
    listener: (payload: unknown) => void,
  ): (() => void) => {
    const api = getElectronApi();
    if (!api?.window) return () => {};
    const sub = api.window.onWorkspaceChanged(listener);
    return () => sub.unsubscribe();
  },
};

export async function getFileContentForChangeCard(
  path: string,
): Promise<ElectronFileContentResult> {
  return filesApi.getContent(path);
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

  /** Delegates to {@link aiService.summarizeThread}; retained for back-compat callers. */
  summarizeThread: (
    messages: ChatMessage[],
    focusInstructions?: string | null,
    parentMessages?: ChatMessage[],
  ): Promise<{ summary: string; title: string }> =>
    aiService.summarizeThread({ messages, focusInstructions, parentMessages }),
};
