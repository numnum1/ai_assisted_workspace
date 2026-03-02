import type { FileNode, Mode, ChatRequest, GitStatus, GitCommit } from './types.ts';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
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

export const filesApi = {
  getTree: () => get<FileNode>('/files'),
  getContent: (path: string) =>
    get<{ path: string; content: string; lines: number }>(`/files/content/${path}`),
  saveContent: (path: string, content: string) =>
    put<{ status: string }>(`/files/content/${path}`, { content }),
};

export const modesApi = {
  getAll: () => get<Mode[]>('/modes'),
};

export const gitApi = {
  status: () => get<GitStatus>('/git/status'),
  commit: (message: string) => post<{ hash: string; message: string }>('/git/commit', { message }),
  diff: () => get<{ diff: string }>('/git/diff'),
  log: (limit = 20) => get<GitCommit[]>(`/git/log?limit=${limit}`),
  init: () => post<{ status: string }>('/git/init', {}),
};

export function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  onContext: (info: { includedFiles: string[]; estimatedTokens: number }) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Chat error: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:context')) {
            continue;
          } else if (line.startsWith('data:') && !line.includes('[DONE]')) {
            const data = line.substring(5);
            try {
              const parsed = JSON.parse(data);
              if (parsed.includedFiles) {
                onContext(parsed);
                continue;
              }
            } catch {
              // Not JSON, treat as token
            }
            const unescaped = data.replace(/\\n/g, '\n');
            onToken(unescaped);
          } else if (line.startsWith('event:done')) {
            onDone();
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err);
    });

  return controller;
}
