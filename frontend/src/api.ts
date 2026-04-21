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

const BASE = "/api";

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

function getElectronApi() {
  return getAppBridge();
}

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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
  return fetch(`${BASE}${path}`, {
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
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
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
  getAll: () => get<Mode[]>("/modes"),
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
    return fetch(`/api/project-config/modes/${id}`, { method: "DELETE" }).then(
      (r) => r.json(),
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
    return fetch(`${BASE}/project-config/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then(async (r) => {
      if (!r.ok) {
        let detail = "";
        try {
          const d = await r.json();
          detail = d.error ?? "";
        } catch {
          /* ignore */
        }
        throw new Error(
          detail || `DELETE project-config/agents/${id}: ${r.status}`,
        );
      }
      return r.json() as Promise<{ status: string }>;
    });
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
  list: () => get<LlmsListResponse>("/llms"),
  create: (body: LlmCreateRequest) => post<LlmPublic>("/llms", body),
  update: (id: string, body: LlmUpdateRequest) =>
    put<LlmPublic>(`/llms/${encodeURIComponent(id)}`, body),
  remove: (id: string) =>
    del<{ status: string }>(`/llms/${encodeURIComponent(id)}`),
};

export const gitApi = {
  status: () => get<GitStatus>("/git/status"),
  commit: (message: string, files?: string[]) =>
    post<{ hash: string; message: string }>("/git/commit", { message, files }),
  revertFile: (path: string, untracked: boolean) =>
    post<{ status: string }>("/git/revert-file", { path, untracked }),
  revertDirectory: (path: string) =>
    post<{ status: string }>("/git/revert-directory", { path }),
  diff: () => get<{ diff: string }>("/git/diff"),
  log: (limit = 20) => get<GitCommit[]>(`/git/log?limit=${limit}`),
  init: () => post<{ status: string }>("/git/init", {}),
  aheadBehind: () => get<GitSyncStatus>("/git/ahead-behind"),
  sync: () => post<{ action: string; details: string }>("/git/sync", {}),
  setCredentials: (username: string, token: string) =>
    post<{ status: string }>("/git/credentials", { username, token }),
  fileHistory: (path: string) =>
    get<GitCommit[]>(`/git/file-history?path=${encodeURIComponent(path)}`),
  fileAtCommit: (path: string, hash: string) =>
    get<{ path: string; hash: string; content: string; exists: boolean }>(
      `/git/file-at-commit?path=${encodeURIComponent(path)}&hash=${encodeURIComponent(hash)}`,
    ),
};

export const chapterApi = {
  list: (structureRoot?: string | null) =>
    get<ChapterSummary[]>(`/chapters${structureRootQuery(structureRoot)}`),
  getStructure: (id: string, structureRoot?: string | null) =>
    get<ChapterNode>(`/chapters/${id}${structureRootQuery(structureRoot)}`),
  create: (title: string, structureRoot?: string | null) =>
    post<ChapterSummary>(`/chapters${structureRootQuery(structureRoot)}`, {
      title,
    }),
  updateMeta: (
    chapterId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    ),
  delete: (chapterId: string, structureRoot?: string | null) =>
    del<{ status: string }>(
      `/chapters/${chapterId}${structureRootQuery(structureRoot)}`,
    ),

  createScene: (
    chapterId: string,
    title: string,
    structureRoot?: string | null,
  ) =>
    post<SceneNode>(
      `/chapters/${chapterId}/scenes${structureRootQuery(structureRoot)}`,
      { title },
    ),
  updateSceneMeta: (
    chapterId: string,
    sceneId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    ),
  deleteScene: (
    chapterId: string,
    sceneId: string,
    structureRoot?: string | null,
  ) =>
    del<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}${structureRootQuery(structureRoot)}`,
    ),

  createAction: (
    chapterId: string,
    sceneId: string,
    title: string,
    structureRoot?: string | null,
  ) =>
    post<ActionNode>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions${structureRootQuery(structureRoot)}`,
      { title },
    ),
  updateActionMeta: (
    chapterId: string,
    sceneId: string,
    actionId: string,
    meta: NodeMeta,
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/meta${structureRootQuery(structureRoot)}`,
      meta,
    ),
  deleteAction: (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ) =>
    del<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}${structureRootQuery(structureRoot)}`,
    ),

  getActionContent: (
    chapterId: string,
    sceneId: string,
    actionId: string,
    structureRoot?: string | null,
  ) =>
    get<{ content: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content${structureRootQuery(structureRoot)}`,
    ),
  saveActionContent: (
    chapterId: string,
    sceneId: string,
    actionId: string,
    content: string,
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content${structureRootQuery(structureRoot)}`,
      { content },
    ),

  reorderScenes: (
    chapterId: string,
    ids: string[],
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/reorder${structureRootQuery(structureRoot)}`,
      { ids },
    ),
  reorderActions: (
    chapterId: string,
    sceneId: string,
    ids: string[],
    structureRoot?: string | null,
  ) =>
    put<{ status: string }>(
      `/chapters/${chapterId}/scenes/${sceneId}/reorder${structureRootQuery(structureRoot)}`,
      { ids },
    ),

  randomizeIds: (structureRoot?: string | null) =>
    post<{ renamed: number }>(
      `/chapters/randomize-ids${structureRootQuery(structureRoot)}`,
      {},
    ),
};

export const bookApi = {
  getMeta: (structureRoot?: string | null) =>
    get<NodeMeta>(`/book/meta${structureRootQuery(structureRoot)}`),
  updateMeta: (meta: NodeMeta, structureRoot?: string | null) =>
    put<{ status: string }>(
      `/book/meta${structureRootQuery(structureRoot)}`,
      meta,
    ),
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

export const chatApi = {
  previewContext: (body: ChatRequest) =>
    post<{
      includedFiles: string[];
      estimatedTokens: number;
      contextBlocks: ContextBlock[];
      systemPrompt: string;
    }>("/chat/context-preview", body),
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

  fetch(`${BASE}/chat`, {
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
