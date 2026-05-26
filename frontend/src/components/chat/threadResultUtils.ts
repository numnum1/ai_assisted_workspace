/**
 * Parsing for `report_thread_result` → ```thread_result fenced blocks (JSON payload).
 */

const THREAD_RESULT_FENCE_RE = /```thread_result\s*\n([\s\S]*?)\n```/;

export interface ThreadResultPayload {
  summary: string;
  threadTitle?: string;
  updatedFiles?: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function hasThreadResultFence(content: string): boolean {
  return THREAD_RESULT_FENCE_RE.test(content);
}

/**
 * Returns parsed payload or null if missing / invalid (e.g. empty summary).
 */
export function parseThreadResult(content: string): ThreadResultPayload | null {
  const m = content.match(THREAD_RESULT_FENCE_RE);
  if (!m) return null;
  try {
    const raw = m[1].trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isNonEmptyString(parsed.summary)) return null;
    const out: ThreadResultPayload = { summary: parsed.summary.trim() };
    if (isNonEmptyString(parsed.threadTitle)) out.threadTitle = parsed.threadTitle.trim();
    if (Array.isArray(parsed.updatedFiles)) {
      const files = parsed.updatedFiles.filter(isNonEmptyString).map((f) => f.trim());
      if (files.length > 0) out.updatedFiles = files;
    }
    return out;
  } catch {
    return null;
  }
}
