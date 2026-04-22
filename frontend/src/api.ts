import type {
  AgentPreset,
  FileNode,
  Mode,
  ChatRequest,
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
import { getAppBridge, isRunningInElectron } from "./electron/bridge.ts";

/**
 * Spring REST prefix when the UI runs in the browser (Vite proxies `/api` → backend).
 * In Electron, data must go through `appBridge` / IPC — HTTP to this app is disabled.
 */
function httpApiPrefix(): string {
  if (isRunningInElectron()) {
    throw new Error(
      "HTTP /api is disabled in Electron; this call should use the preload appBridge.",
    );
  }
  return "/api";
}

/**
 * `vite --mode electron` serves the same bundle to the Electron window and to any browser tab.
 * Only the Electron window has `appBridge`; browser tabs must not call `/api` (no proxy, no Spring).
 */
function isElectronShellUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bElectron\//.test(navigator.userAgent);
}

function assertWebSpringApiAvailable(): void {
  if (import.meta.env.MODE !== "electron") return;
  if (isRunningInElectron()) return;
  if (isElectronShellUserAgent()) {
    throw new Error(
      "Electron-Fenster hat kein `window.appBridge` (Preload lädt nicht). Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten. In der Konsole des **Main-Prozesses** nach Preload-Fehlern suchen.",
    );
  }
  throw new Error(
    "Dieses Dev-Bundle läuft mit `vite --mode electron`: Im normalen Browser-Tab gibt es kein Preload und kein `/api`. Bitte nur das Electron-Fenster nutzen, oder `npm run dev:vite` + Spring auf Port 8012.",
  );
}

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

async function get<T>(path: string): Promise<T> {
  assertWebSpringApiAvailable();
  const res = await fetch(`${httpApiPrefix()}${path}`);
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.error ?? d.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GET ${path}: ${res.status}`);
  }
  return res.json();
}

async function postRaw(path: string, body: unknown): Promise<Response> {
  assertWebSpringApiAvailable();
  return fetch(`${httpApiPrefix()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await postRaw(path, body);
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.error ?? d.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `POST ${path}: ${res.status}`);
  }
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  assertWebSpringApiAvailable();
  const res = await fetch(`${httpApiPrefix()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  assertWebSpringApiAvailable();
  const res = await fetch(`${httpApiPrefix()}${path}`, { method: "DELETE" });
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.error ?? d.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `DELETE ${path}: ${res.status}`);
  }
  return res.json();
}

/** Encode each path segment for /api/files/content/... URLs */
function encodeFilePathForApi(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

/** Optional chapter/book structure root (subfolder path relative to project) */
function structureRootQuery(structureRoot?: string | null): string {
  if (structureRoot == null || structureRoot === "" || structureRoot === ".")
    return "";
  return `?root=${encodeURIComponent(structureRoot)}`;
}

export const filesApi = {
  getTree: async (): Promise<FileNode> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files) return electronApi.files.getTree();
    }
    return get<FileNode>("/files");
  },
  getContent: async (path: string): Promise<FileContentResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files) return electronApi.files.getContent(path);
    }
    return get<FileContentResponse>(
      `/files/content/${encodeFilePathForApi(path)}`,
    );
  },
  saveContent: async (
    path: string,
    content: string,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files)
        return electronApi.files.saveContent(path, content);
    }
    return put<{ status: string }>(
      `/files/content/${encodeFilePathForApi(path)}`,
      { content },
    );
  },
  deleteContent: async (path: string): Promise<FileMutationResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files) return electronApi.files.deleteContent(path);
    }
    return del<FileMutationResponse>(
      `/files/content/${encodeFilePathForApi(path)}`,
    );
  },
  createFile: async (
    parentPath: string,
    name: string,
  ): Promise<FileMutationResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files)
        return electronApi.files.createFile(parentPath, name);
    }
    return post<FileMutationResponse>("/files/create-file", {
      parentPath,
      name,
    });
  },
  createFolder: async (
    parentPath: string,
    name: string,
  ): Promise<FileMutationResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files)
        return electronApi.files.createFolder(parentPath, name);
    }
    return post<FileMutationResponse>("/files/create-folder", {
      parentPath,
      name,
    });
  },
  rename: async (
    path: string,
    newName: string,
  ): Promise<FileMutationResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files) return electronApi.files.rename(path, newName);
    }
    return post<FileMutationResponse>("/files/rename", { path, newName });
  },
  move: async (
    path: string,
    targetParentPath: string,
  ): Promise<FileMutationResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.files)
        return electronApi.files.move(path, targetParentPath);
    }
    return post<FileMutationResponse>("/files/move", {
      path,
      targetParentPath,
    });
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
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.getModes();
      }
    }
    return get<Mode[]>("/modes");
  },
};

export const projectApi = {
  current: async (): Promise<ProjectCurrentResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.project) return electronApi.project.current();
    }
    return get<ProjectCurrentResponse>("/project/current");
  },
  reveal: async (): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.project) return electronApi.project.reveal();
    }
    return post<{ status: string }>("/project/reveal", {});
  },
  browse: async (): Promise<ProjectBrowseResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.project) return electronApi.project.browse();
    }
    const res = await postRaw("/project/browse", {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Browse failed: ${res.status}`);
    return data;
  },
  open: async (path: string): Promise<ProjectOpenResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.project) return electronApi.project.open(path);
    }
    const res = await postRaw("/project/open", { path });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to open: ${res.status}`);
    return data;
  },
};

export const projectConfigApi = {
  status: async (): Promise<ProjectConfigStatusResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) return electronApi.projectConfig.status();
    }
    return get<ProjectConfigStatusResponse>("/project-config/status");
  },
  getWorkspaceMode: async (
    modeId?: string | null,
  ): Promise<WorkspaceModeSchema> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.getWorkspaceMode(modeId);
      }
    }
    return modeId != null && modeId !== ""
      ? get<WorkspaceModeSchema>(
          `/project-config/workspace-mode?id=${encodeURIComponent(modeId)}`,
        )
      : get<WorkspaceModeSchema>("/project-config/workspace-mode");
  },
  listWorkspaceModes: async (): Promise<WorkspaceModeInfo[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.listWorkspaceModes();
      }
    }
    return get<WorkspaceModeInfo[]>("/project-config/workspace-modes");
  },
  getWorkspaceModesDataDir: async (): Promise<{
    path: string;
    exists: boolean;
  }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.getWorkspaceModesDataDir();
      }
    }
    return get<{ path: string; exists: boolean }>(
      "/project-config/workspace-modes/data-dir",
    );
  },
  revealWorkspaceModesDataDir: async (): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.revealWorkspaceModesDataDir();
      }
    }
    return post<{ status: string }>(
      "/project-config/workspace-modes/reveal-data-dir",
      {},
    );
  },
  get: async (): Promise<ProjectConfig> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) return electronApi.projectConfig.get();
    }
    return get<ProjectConfig>("/project-config");
  },
  init: async (): Promise<ProjectConfig> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) return electronApi.projectConfig.init();
    }
    return post<ProjectConfig>("/project-config/init", {});
  },
  update: async (config: ProjectConfig): Promise<ProjectConfig> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.update(config);
      }
    }
    return put<ProjectConfig>("/project-config", config);
  },
  getModes: async (): Promise<Mode[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig)
        return electronApi.projectConfig.getModes();
    }
    return get<Mode[]>("/project-config/modes");
  },
  saveMode: async (id: string, mode: Mode): Promise<Mode> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.saveMode(id, mode);
      }
    }
    return put<Mode>(`/project-config/modes/${id}`, mode);
  },
  deleteMode: async (id: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.deleteMode(id);
      }
    }
    return del<{ status: string }>(
      `/project-config/modes/${encodeURIComponent(id)}`,
    );
  },
  listAgents: async (): Promise<AgentPreset[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig)
        return electronApi.projectConfig.listAgents();
    }
    return get<AgentPreset[]>("/project-config/agents");
  },
  saveAgent: async (id: string, preset: AgentPreset): Promise<AgentPreset> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.saveAgent(id, preset);
      }
    }
    return put<AgentPreset>(
      `/project-config/agents/${encodeURIComponent(id)}`,
      preset,
    );
  },
  deleteAgent: async (id: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.projectConfig) {
        return electronApi.projectConfig.deleteAgent(id);
      }
    }
    return del<{ status: string }>(
      `/project-config/agents/${encodeURIComponent(id)}`,
    );
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
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.llms) return electronApi.llms.list();
    }
    return get<LlmsListResponse>("/llms");
  },
  create: async (body: LlmCreateRequest): Promise<LlmPublic> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.llms) return electronApi.llms.create(body);
    }
    return post<LlmPublic>("/llms", body);
  },
  update: async (id: string, body: LlmUpdateRequest): Promise<LlmPublic> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.llms) return electronApi.llms.update(id, body);
    }
    return put<LlmPublic>(`/llms/${encodeURIComponent(id)}`, body);
  },
  remove: async (id: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.llms) return electronApi.llms.remove(id);
    }
    return del<{ status: string }>(`/llms/${encodeURIComponent(id)}`);
  },
};

export const gitApi = {
  status: async (): Promise<GitStatus> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.status());
      }
    }
    return get<GitStatus>("/git/status");
  },
  commit: async (
    message: string,
    files?: string[],
  ): Promise<{ hash: string; message: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.commit(message, files));
      }
    }
    return post<{ hash: string; message: string }>("/git/commit", {
      message,
      files,
    });
  },
  revertFile: async (
    path: string,
    untracked: boolean,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() =>
          electronApi.git!.revertFile(path, untracked),
        );
      }
    }
    return post<{ status: string }>("/git/revert-file", { path, untracked });
  },
  revertDirectory: async (path: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.revertDirectory(path));
      }
    }
    return post<{ status: string }>("/git/revert-directory", { path });
  },
  diff: async (): Promise<{ diff: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.diff());
      }
    }
    return get<{ diff: string }>("/git/diff");
  },
  log: async (limit = 20): Promise<GitCommit[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.log(limit));
      }
    }
    return get<GitCommit[]>(`/git/log?limit=${limit}`);
  },
  init: async (): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.init());
      }
    }
    return post<{ status: string }>("/git/init", {});
  },
  aheadBehind: async (): Promise<GitSyncStatus> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.aheadBehind());
      }
    }
    return get<GitSyncStatus>("/git/ahead-behind");
  },
  sync: async (): Promise<{ action: string; details: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.sync());
      }
    }
    return post<{ action: string; details: string }>("/git/sync", {});
  },
  setCredentials: async (
    username: string,
    token: string,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() =>
          electronApi.git!.setCredentials(username, token),
        );
      }
    }
    return post<{ status: string }>("/git/credentials", { username, token });
  },
  fileHistory: async (path: string): Promise<GitCommit[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() => electronApi.git!.fileHistory(path));
      }
    }
    return get<GitCommit[]>(
      `/git/file-history?path=${encodeURIComponent(path)}`,
    );
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
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.git) {
        return invokeGitBridge(() =>
          electronApi.git!.fileAtCommit(path, hash),
        );
      }
    }
    return get<{
      path: string;
      hash: string;
      content: string;
      exists: boolean;
    }>(
      `/git/file-at-commit?path=${encodeURIComponent(path)}&hash=${encodeURIComponent(hash)}`,
    );
  },
};

export const chapterApi = {
  list: async (
    structureRoot?: string | null,
  ): Promise<ChapterSummary[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.list(structureRoot);
      }
    }
    return get<ChapterSummary[]>(
      `/chapters${structureRootQuery(structureRoot)}`,
    );
  },
  getStructure: async (
    id: string,
    structureRoot?: string | null,
  ): Promise<ChapterNode> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.getStructure(id, structureRoot);
      }
    }
    return get<ChapterNode>(`/chapters/${id}${structureRootQuery(structureRoot)}`);
  },
  create: async (
    title: string,
    structureRoot?: string | null,
  ): Promise<ChapterSummary> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.create(title, structureRoot);
      }
    }
    return post<ChapterSummary>(
      `/chapters${structureRootQuery(structureRoot)}`,
      { title },
    );
  },
  updateMeta: async (
    chapterId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.updateMeta(
          chapterId,
          meta,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    );
  },
  delete: async (
    chapterId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.delete(chapterId, structureRoot);
      }
    }
    return del<{ status: string }>(
      `/chapters/${chapterId}${structureRootQuery(structureRoot)}`,
    );
  },

  createScene: async (
    chapterId: string,
    title: string,
    structureRoot?: string | null,
  ): Promise<SceneNode> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.createScene(
          chapterId,
          title,
          structureRoot,
        );
      }
    }
    return post<SceneNode>(
      `/chapters/${chapterId}/scenes${structureRootQuery(structureRoot)}`,
      { title },
    );
  },
  updateSceneMeta: async (
    chapterId: string,
    sceneId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.updateSceneMeta(
          chapterId,
          sceneId,
          meta,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    );
  },
  deleteScene: async (
    chapterId: string,
    sceneId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.deleteScene(
          chapterId,
          sceneId,
          structureRoot,
        );
      }
    }
    return del<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}${structureRootQuery(structureRoot)}`,
    );
  },

  createAction: async (
    chapterId: string,
    sceneId: string,
    title: string,
    structureRoot?: string | null,
  ): Promise<ActionNode> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.createAction(
          chapterId,
          sceneId,
          title,
          structureRoot,
        );
      }
    }
    return post<ActionNode>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions${structureRootQuery(structureRoot)}`,
      { title },
    );
  },
  updateActionMeta: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.updateActionMeta(
          chapterId,
          sceneId,
          actionId,
          meta,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    );
  },
  deleteAction: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.deleteAction(
          chapterId,
          sceneId,
          actionId,
          structureRoot,
        );
      }
    }
    return del<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}${structureRootQuery(structureRoot)}`,
    );
  },

  getActionContent: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ): Promise<{ content: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.getActionContent(
          chapterId,
          sceneId,
          actionId,
          structureRoot,
        );
      }
    }
    return get<{ content: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content${structureRootQuery(structureRoot)}`,
    );
  },
  saveActionContent: async (
    chapterId: string,
    sceneId: string,
    actionId: string,
    content: string,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.saveActionContent(
          chapterId,
          sceneId,
          actionId,
          content,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content${structureRootQuery(structureRoot)}`,
      { content },
    );
  },

  reorderScenes: async (
    chapterId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.reorderScenes(
          chapterId,
          ids,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/reorder${structureRootQuery(structureRoot)}`,
      { ids },
    );
  },
  reorderActions: async (
    chapterId: string,
    sceneId: string,
    ids: string[],
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.reorderActions(
          chapterId,
          sceneId,
          ids,
          structureRoot,
        );
      }
    }
    return put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/reorder${structureRootQuery(structureRoot)}`,
      { ids },
    );
  },

  randomizeIds: async (
    structureRoot?: string | null,
  ): Promise<{ renamed: number }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.chapter) {
        return electronApi.chapter.randomizeIds(structureRoot);
      }
    }
    return post<{ renamed: number }>(
      `/chapters/randomize-ids${structureRootQuery(structureRoot)}`,
      {},
    );
  },
};

export const bookApi = {
  getMeta: async (structureRoot?: string | null): Promise<NodeMeta> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.book) {
        return electronApi.book.getMeta(structureRoot);
      }
    }
    return get<NodeMeta>(`/book/meta${structureRootQuery(structureRoot)}`);
  },
  updateMeta: async (
    meta: NodeMeta,
    structureRoot?: string | null,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.book) {
        return electronApi.book.updateMeta(meta, structureRoot);
      }
    }
    return put<{ status: string }>(
      `/book/meta${structureRootQuery(structureRoot)}`,
      meta,
    );
  },
};

export const subprojectApi = {
  info: async (
    path: string,
  ): Promise<{ subproject: boolean; type?: string; name?: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.subproject) return electronApi.subproject.info(path);
    }
    return get<{ subproject: boolean; type?: string; name?: string }>(
      `/subproject/info?path=${encodeURIComponent(path)}`,
    );
  },
  init: async (
    path: string,
    type: string,
    name: string,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.subproject) {
        return electronApi.subproject.init(path, type, name);
      }
    }
    return post<{ status: string }>("/subproject/init", { path, type, name });
  },
  remove: async (path: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.subproject) return electronApi.subproject.remove(path);
    }
    return del<{ status: string }>(
      `/subproject/remove?path=${encodeURIComponent(path)}`,
    );
  },
};

export const wikiApi = {
  listFiles: async (): Promise<string[]> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.wiki) return electronApi.wiki.listFiles();
    }
    return get<string[]>("/wiki/files");
  },
  search: async (
    q: string,
    limit?: number,
  ): Promise<Array<{ path: string; title: string; snippet: string }>> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.wiki) return electronApi.wiki.search(q, limit);
    }
    return get<Array<{ path: string; title: string; snippet: string }>>(
      `/wiki/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}`,
    );
  },
};

export const glossaryApi = {
  get: async (): Promise<GlossaryApiResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.glossary) return electronApi.glossary.get();
    }
    return get<GlossaryApiResponse>("/glossary");
  },
  addEntry: async (
    term: string,
    definition: string,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.glossary) {
        return electronApi.glossary.addEntry(term, definition);
      }
    }
    return post<{ status: string }>("/glossary/entries", { term, definition });
  },
  deleteEntry: async (term: string): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.glossary) {
        return electronApi.glossary.deleteEntry(term);
      }
    }
    return del<{ status: string }>(
      `/glossary/entries?term=${encodeURIComponent(term)}`,
    );
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
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.search) {
        return electronApi.search.query(query, limit);
      }
    }
    return get<SearchResponse>(
      `/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
  },
};

export const typedFilesApi = {
  getContent: async (path: string): Promise<TypedFileContentResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.typedFiles) {
        return electronApi.typedFiles.getContent(path);
      }
    }
    return get<TypedFileContentResponse>(
      `/typed-files/content/${encodeFilePathForApi(path)}`,
    );
  },
  saveContent: async (
    path: string,
    data: Record<string, unknown>,
  ): Promise<{ status: string }> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.typedFiles) {
        return electronApi.typedFiles.saveContent(path, data);
      }
    }
    return put<{ status: string }>(
      `/typed-files/content/${encodeFilePathForApi(path)}`,
      { data },
    );
  },
  fill: async (path: string): Promise<TypedFileFillResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.typedFiles) {
        return electronApi.typedFiles.fill(path);
      }
    }
    return post<TypedFileFillResponse>(
      `/typed-files/fill/${encodeFilePathForApi(path)}`,
      {},
    );
  },
};

export const snapshotsApi = {
  get: async (id: string): Promise<SnapshotResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.snapshots) {
        return electronApi.snapshots.get(id);
      }
    }
    return get<SnapshotResponse>(`/snapshots/${encodeURIComponent(id)}`);
  },
  apply: async (id: string): Promise<SnapshotApplyResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.snapshots) {
        return electronApi.snapshots.apply(id);
      }
    }
    return post<SnapshotApplyResponse>(
      `/snapshots/${encodeURIComponent(id)}/apply`,
      {},
    );
  },
  revert: async (id: string): Promise<SnapshotRevertResponse> => {
    if (isRunningInElectron()) {
      const electronApi = getElectronApi();
      if (electronApi?.snapshots) {
        return electronApi.snapshots.revert(id);
      }
    }
    return post<SnapshotRevertResponse>(
      `/snapshots/${encodeURIComponent(id)}/revert`,
      {},
    );
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
    if (bridge?.chat) {
      return bridge.chat.previewContext(body);
    }
    if (bridge?.isElectron) {
      throw new Error(
        "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.",
      );
    }
    return post<{
      includedFiles: string[];
      estimatedTokens: number;
      contextBlocks: ContextBlock[];
      systemPrompt: string;
    }>("/chat/context-preview", body);
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

  if (bridge?.isElectron) {
    queueMicrotask(() =>
      onError(
        new Error(
          "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann Dev neu starten.",
        ),
      ),
    );
    return controller;
  }

  assertWebSpringApiAvailable();
  fetch(`${httpApiPrefix()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        let detail = `Chat error: ${res.status}`;
        try {
          const body = await res.text();
          if (body) detail += ` — ${body}`;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let doneHandled = false;
      let errorHandled = false;
      let tokenCount = 0;
      let fullAssistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.substring(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.substring(5);
            if (currentEvent === "context") {
              try {
                onContext(JSON.parse(data));
              } catch (e) {
                console.warn(
                  "[streamChat] Failed to parse context event data:",
                  e,
                  "raw:",
                  data.substring(0, 200),
                );
              }
            } else if (currentEvent === "error") {
              console.warn(
                "[streamChat] Received error event from backend:",
                data,
              );
              onError(new Error(data));
              errorHandled = true;
              doneHandled = true;
            } else if (currentEvent === "done") {
              if (!errorHandled) {
                if (tokenCount === 0) {
                  console.warn(
                    "[streamChat] Stream ended (done event) but 0 tokens were received — model returned no content. " +
                      "Check backend logs for finish_reason=length or empty completion warnings.",
                  );
                  onError(new Error("MODEL_EMPTY_RESPONSE"));
                } else {
                  onDone(fullAssistantText);
                }
              }
              doneHandled = true;
            } else if (currentEvent === "tool_call") {
              const unescaped = data.replace(/\\n/g, "\n");
              onToolCall?.(unescaped);
            } else if (currentEvent === "tool_history") {
              try {
                onToolHistory?.(JSON.parse(data));
              } catch (e) {
                console.warn(
                  "[streamChat] Failed to parse tool_history event data:",
                  e,
                  "raw:",
                  data.substring(0, 200),
                );
              }
            } else if (currentEvent === "resolved_user_message") {
              const unescaped = data.replace(/\\n/g, "\n");
              onResolvedUserMessage?.(unescaped);
            } else if (currentEvent === "context_update") {
              try {
                const parsed = JSON.parse(data);
                onContextUpdate?.(parsed.estimatedTokens);
              } catch (e) {
                console.warn(
                  "[streamChat] Failed to parse context_update event data:",
                  e,
                  "raw:",
                  data.substring(0, 200),
                );
              }
            } else if (currentEvent === "token") {
              tokenCount++;
              const unescaped = data.replace(/\\n/g, "\n");
              fullAssistantText += unescaped;
              onToken(unescaped);
              await yieldMacrotaskForTokenPaint();
            }
            currentEvent = "";
          }
        }
      }
      if (!doneHandled) {
        if (tokenCount === 0) {
          console.warn(
            "[streamChat] SSE stream closed by server without a done event and 0 tokens received.",
          );
          onError(new Error("MODEL_EMPTY_RESPONSE"));
        } else {
          onDone(fullAssistantText);
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err);
    });

  return controller;
}
