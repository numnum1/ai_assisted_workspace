import type { ChatMessage } from '../types.ts';

const WIKI_READ = 'wiki_read';
const READ_FILE = 'read_file';

function parsePathFromArguments(argsJson: string): string | null {
  try {
    const parsed = JSON.parse(argsJson) as { path?: unknown };
    if (typeof parsed.path === 'string' && parsed.path.trim().length > 0) {
      return parsed.path.trim();
    }
  } catch {
    // ignore malformed JSON from the model
  }
  return null;
}

/** wiki_read paths are relative to wiki/; normalize to project-relative `wiki/...`. */
function normalizeWikiReadPath(relativePath: string): string {
  const p = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p.startsWith('wiki/')) {
    return p;
  }
  return `wiki/${p}`;
}

/**
 * Collects project file paths that were read via wiki_read / read_file from a
 * `tool_history` slice (assistant messages with toolCalls).
 */
export function extractFilesReadByTools(messages: ChatMessage[]): string[] {
  const out = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.toolCalls?.length) continue;
    for (const tc of msg.toolCalls) {
      const name = tc.function?.name;
      const path = parsePathFromArguments(tc.function?.arguments ?? '{}');
      if (!path) continue;
      if (name === WIKI_READ) {
        out.add(normalizeWikiReadPath(path));
      } else if (name === READ_FILE) {
        out.add(path.replace(/\\/g, '/'));
      }
    }
  }
  return [...out];
}
