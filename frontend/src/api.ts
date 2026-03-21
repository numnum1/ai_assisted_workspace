import type { FileNode, Mode, ChatRequest, GitStatus, GitCommit, GitSyncStatus, ProjectConfig, ChapterSummary, ChapterNode, SceneNode, ActionNode, NodeMeta, WikiType, WikiEntry } from './types.ts';

const BASE = '/api';

export class AuthRequiredError extends Error {
  constructor() { super('auth_required'); this.name = 'AuthRequiredError'; }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = '';
    try { const d = await res.json(); detail = d.error ?? d.message ?? ''; } catch { /* ignore */ }
    throw new Error(detail || `GET ${path}: ${res.status}`);
  }
  return res.json();
}

async function postRaw(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await postRaw(path, body);
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = '';
    try { const d = await res.json(); detail = d.error ?? d.message ?? ''; } catch { /* ignore */ }
    throw new Error(detail || `POST ${path}: ${res.status}`);
  }
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    let detail = '';
    try { const d = await res.json(); detail = d.error ?? d.message ?? ''; } catch { /* ignore */ }
    throw new Error(detail || `DELETE ${path}: ${res.status}`);
  }
  return res.json();
}

export const filesApi = {
  getTree: () => get<FileNode>('/files'),
  getContent: (path: string) =>
    get<{ path: string; content: string; lines: number }>(`/files/content/${path}`),
  saveContent: (path: string, content: string) =>
    put<{ status: string }>(`/files/content/${path}`, { content }),
  deleteContent: (path: string) =>
    del<{ status: string; path: string }>(`/files/content/${path}`),
  createFile: (parentPath: string, name: string) =>
    post<{ status: string; path: string }>('/files/create-file', { parentPath, name }),
  createFolder: (parentPath: string, name: string) =>
    post<{ status: string; path: string }>('/files/create-folder', { parentPath, name }),
  rename: (path: string, newName: string) =>
    post<{ status: string; path: string }>('/files/rename', { path, newName }),
};

export const modesApi = {
  getAll: () => get<Mode[]>('/modes'),
};

export const projectApi = {
  current: () => get<{ path: string; hasProject: boolean; initialized: boolean }>('/project/current'),
  reveal: () => post<{ status: string }>('/project/reveal', {}),
  browse: async (): Promise<{ cancelled: boolean; path?: string }> => {
    const res = await postRaw('/project/browse', {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Browse failed: ${res.status}`);
    return data;
  },
  open: async (path: string): Promise<{ status: string; path: string; tree: FileNode; initialized: boolean }> => {
    const res = await postRaw('/project/open', { path });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to open: ${res.status}`);
    return data;
  },
};

export const projectConfigApi = {
  status: () => get<{ initialized: boolean }>('/project-config/status'),
  get: () => get<ProjectConfig>('/project-config'),
  init: () => post<ProjectConfig>('/project-config/init', {}),
  update: (config: ProjectConfig) => put<ProjectConfig>('/project-config', config),
  getModes: () => get<Mode[]>('/project-config/modes'),
  saveMode: (id: string, mode: Mode) => put<Mode>(`/project-config/modes/${id}`, mode),
  deleteMode: (id: string) => fetch(`/api/project-config/modes/${id}`, { method: 'DELETE' }).then(r => r.json()),
  getRules: () => get<string[]>('/project-config/rules'),
  getRuleContent: (name: string) => get<{ name: string; content: string }>(`/project-config/rules/${name}`),
  saveRule: (name: string, content: string) => put<{ status: string; name: string }>(`/project-config/rules/${name}`, { content }),
  deleteRule: (name: string) => fetch(`/api/project-config/rules/${name}`, { method: 'DELETE' }).then(r => r.json()),
};

export const gitApi = {
  status: () => get<GitStatus>('/git/status'),
  commit: (message: string, files?: string[]) =>
    post<{ hash: string; message: string }>('/git/commit', { message, files }),
  revertFile: (path: string, untracked: boolean) =>
    post<{ status: string }>('/git/revert-file', { path, untracked }),
  diff: () => get<{ diff: string }>('/git/diff'),
  log: (limit = 20) => get<GitCommit[]>(`/git/log?limit=${limit}`),
  init: () => post<{ status: string }>('/git/init', {}),
  aheadBehind: () => get<GitSyncStatus>('/git/ahead-behind'),
  sync: () => post<{ action: string; details: string }>('/git/sync', {}),
  setCredentials: (username: string, token: string) =>
    post<{ status: string }>('/git/credentials', { username, token }),
  fileHistory: (path: string) =>
    get<GitCommit[]>(`/git/file-history?path=${encodeURIComponent(path)}`),
  fileAtCommit: (path: string, hash: string) =>
    get<{ path: string; hash: string; content: string; exists: boolean }>(
      `/git/file-at-commit?path=${encodeURIComponent(path)}&hash=${encodeURIComponent(hash)}`
    ),
};

export const chapterApi = {
  list: () => get<ChapterSummary[]>('/chapters'),
  getStructure: (id: string) => get<ChapterNode>(`/chapters/${id}`),
  create: (title: string) => post<ChapterSummary>('/chapters', { title }),
  updateMeta: (chapterId: string, meta: NodeMeta) =>
    put<{ status: string }>(`/chapters/${chapterId}/meta`, meta),
  delete: (chapterId: string) =>
    del<{ status: string }>(`/chapters/${chapterId}`),

  createScene: (chapterId: string, title: string) =>
    post<SceneNode>(`/chapters/${chapterId}/scenes`, { title }),
  updateSceneMeta: (chapterId: string, sceneId: string, meta: NodeMeta) =>
    put<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}/meta`, meta),
  deleteScene: (chapterId: string, sceneId: string) =>
    del<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}`),

  createAction: (chapterId: string, sceneId: string, title: string) =>
    post<ActionNode>(`/chapters/${chapterId}/scenes/${sceneId}/actions`, { title }),
  updateActionMeta: (chapterId: string, sceneId: string, actionId: string, meta: NodeMeta) =>
    put<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/meta`, meta),
  deleteAction: (chapterId: string, sceneId: string, actionId: string) =>
    del<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}`),

  getActionContent: (chapterId: string, sceneId: string, actionId: string) =>
    get<{ content: string }>(`/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content`),
  saveActionContent: (chapterId: string, sceneId: string, actionId: string, content: string) =>
    put<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}/actions/${actionId}/content`, { content }),

  reorderScenes: (chapterId: string, ids: string[]) =>
    put<{ status: string }>(`/chapters/${chapterId}/reorder`, { ids }),
  reorderActions: (chapterId: string, sceneId: string, ids: string[]) =>
    put<{ status: string }>(`/chapters/${chapterId}/scenes/${sceneId}/reorder`, { ids }),
};

export const bookApi = {
  getMeta: () => get<NodeMeta>('/book/meta'),
  updateMeta: (meta: NodeMeta) => put<{ status: string }>('/book/meta', meta),
};

export const wikiApi = {
  listTypes: () =>
    get<WikiType[]>('/wiki/types'),
  createType: (name: string, fields?: WikiType['fields']) =>
    post<WikiType>('/wiki/types', fields ? { name, fields } : { name }),
  getType: (typeId: string) =>
    get<WikiType>(`/wiki/types/${typeId}`),
  updateType: (typeId: string, type: WikiType) =>
    put<WikiType>(`/wiki/types/${typeId}`, type),
  deleteType: (typeId: string) =>
    del<{ status: string }>(`/wiki/types/${typeId}`),
  listEntries: (typeId: string) =>
    get<WikiEntry[]>(`/wiki/types/${typeId}/entries`),
  createEntry: (typeId: string, name: string) =>
    post<WikiEntry>(`/wiki/types/${typeId}/entries`, { name }),
  getEntry: (typeId: string, entryId: string) =>
    get<WikiEntry>(`/wiki/types/${typeId}/entries/${entryId}`),
  updateEntry: (typeId: string, entryId: string, values: Record<string, string>) =>
    put<WikiEntry>(`/wiki/types/${typeId}/entries/${entryId}`, { values }),
  deleteEntry: (typeId: string, entryId: string) =>
    del<{ status: string }>(`/wiki/types/${typeId}/entries/${entryId}`),
};

export function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  onContext: (info: { includedFiles: string[]; estimatedTokens: number }) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  onToolCall?: (description: string) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        let detail = `Chat error: ${res.status}`;
        try {
          const body = await res.text();
          if (body) detail += ` — ${body}`;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let doneHandled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            const data = line.substring(5);
            if (currentEvent === 'context') {
              try {
                onContext(JSON.parse(data));
              } catch { /* ignore malformed context */ }
            } else if (currentEvent === 'error') {
              onError(new Error(data));
              doneHandled = true;
            } else if (currentEvent === 'done') {
              onDone();
              doneHandled = true;
            } else if (currentEvent === 'tool_call') {
              const unescaped = data.replace(/\\n/g, '\n');
              onToolCall?.(unescaped);
            } else if (currentEvent === 'token') {
              const unescaped = data.replace(/\\n/g, '\n');
              onToken(unescaped);
            }
            currentEvent = '';
          }
        }
      }
      if (!doneHandled) onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err);
    });

  return controller;
}
