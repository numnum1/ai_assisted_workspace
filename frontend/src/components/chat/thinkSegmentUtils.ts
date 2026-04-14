/**
 * Opening: `<thinking>` (common) or `<think>`.
 * Closing tags and `\think}`: see THINK_CLOSE_RE (long branch before short so they are not confused).
 */
const THINK_OPEN_RE = /<think>|<thinking>/i;
const THINK_CLOSE_RE = /<\/redacted_thinking>|<\/think>|\\think\}/i;

export type ThinkSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'thinking'; text: string; streaming?: boolean };

function findOpen(content: string, from: number): { index: number; len: number } | null {
  const sub = content.slice(from);
  const m = THINK_OPEN_RE.exec(sub);
  if (!m) return null;
  return { index: from + m.index, len: m[0].length };
}

function findClose(content: string, from: number): { index: number; len: number } | null {
  const sub = content.slice(from);
  const m = THINK_CLOSE_RE.exec(sub);
  if (!m) return null;
  return { index: from + m.index, len: m[0].length };
}

function pushMarkdown(segments: ThinkSegment[], raw: string) {
  const t = raw.trim();
  if (t.length > 0) segments.push({ kind: 'markdown', text: t });
}

/**
 * Splits assistant content into alternating markdown and thinking segments.
 * Supports multiple paired blocks, streaming on the last unclosed open tag, and legacy leading text
 * before a close marker without an opening tag.
 */
export function parseThinkSegments(content: string, streaming: boolean): ThinkSegment[] {
  const segments: ThinkSegment[] = [];
  let cursor = 0;
  const n = content.length;

  if (n === 0) return segments;

  const firstOpen = findOpen(content, 0);
  const firstClose = findClose(content, 0);
  const legacyFirst =
    firstClose !== null && (firstOpen === null || firstClose.index < firstOpen.index);

  if (legacyFirst) {
    const thinkingRaw = content.slice(0, firstClose.index);
    const trimmedThink = thinkingRaw.trim();
    if (trimmedThink.length > 0) {
      segments.push({ kind: 'thinking', text: trimmedThink });
    }
    cursor = firstClose.index + firstClose.len;
  }

  while (cursor < n) {
    const open = findOpen(content, cursor);
    if (!open) {
      pushMarkdown(segments, content.slice(cursor));
      break;
    }

    const prefix = content.slice(cursor, open.index).trim();
    if (prefix.length > 0) {
      segments.push({ kind: 'markdown', text: prefix });
    }

    const openEnd = open.index + open.len;
    const close = findClose(content, openEnd);

    if (close) {
      const inner = content.slice(openEnd, close.index).trim();
      if (inner.length > 0) {
        segments.push({ kind: 'thinking', text: inner });
      }
      cursor = close.index + close.len;
      continue;
    }

    if (streaming) {
      const streamingBody = content.slice(openEnd).trimEnd();
      segments.push({ kind: 'thinking', text: streamingBody, streaming: true });
      break;
    }

    pushMarkdown(segments, content.slice(cursor));
    break;
  }

  return segments;
}
