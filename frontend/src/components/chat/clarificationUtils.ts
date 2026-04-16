/**
 * Shared types and parsing for `ask_clarification` / ```clarification fenced blocks.
 */

export interface ClarificationQuestion {
  question: string;
  options: string[];
  allow_multiple?: boolean;
}

const OPEN_LINE_RE = /^```clarification\s*$/;

/** Start indices in `content` of lines that open a clarification fence (the ``` line only). */
function clarificationOpenLineStarts(content: string): number[] {
  const starts: number[] = [];
  let offset = 0;
  const n = content.length;
  while (offset < n) {
    const lineEnd = content.indexOf('\n', offset);
    const end = lineEnd === -1 ? n : lineEnd;
    const line = content.slice(offset, end);
    if (OPEN_LINE_RE.test(line)) {
      starts.push(offset);
    }
    if (lineEnd === -1) break;
    offset = lineEnd + 1;
  }
  return starts;
}

/** Byte offset of first character inside the fence (JSON body), or -1 if malformed opening. */
function bodyStartAfterOpenLine(content: string, openLineStart: number): number {
  const lineEnd = content.indexOf('\n', openLineStart);
  if (lineEnd === -1) {
    return -1;
  }
  let body = lineEnd + 1;
  if (body < content.length && content[body] === '\r') {
    body++;
  }
  return body;
}

/**
 * From a body start offset, returns inner text up to (but not including) the first line that
 * is only ``` (GFM closing fence). Lines use \n or \r\n from the original string.
 */
function innerUntilClosingFence(content: string, bodyStart: number): string | null {
  if (bodyStart < 0 || bodyStart > content.length) return null;
  let offset = bodyStart;
  const n = content.length;
  const bodyLines: string[] = [];
  while (offset < n) {
    const lineEnd = content.indexOf('\n', offset);
    const end = lineEnd === -1 ? n : lineEnd;
    const rawLine = content.slice(offset, end);
    const trimmed = rawLine.trim();
    if (trimmed === '```') {
      return bodyLines.join('\n');
    }
    bodyLines.push(rawLine);
    if (lineEnd === -1) {
      return null;
    }
    offset = lineEnd + 1;
  }
  return null;
}

function validateQuestions(parsed: unknown): ClarificationQuestion[] | null {
  if (Array.isArray(parsed)) {
    const arr = parsed.filter(
      (q) => q && typeof q.question === 'string' && Array.isArray(q.options),
    ) as ClarificationQuestion[];
    return arr.length > 0 ? arr : null;
  }
  if (parsed && typeof parsed === 'object' && typeof (parsed as { question?: unknown }).question === 'string' && Array.isArray((parsed as { options?: unknown }).options)) {
    return [parsed as ClarificationQuestion];
  }
  return null;
}

/**
 * Parses all ```clarification blocks (opening line must match exactly) and returns questions
 * from the last block that yields valid JSON in the expected shape.
 */
export function parseClarificationQuestions(content: string): ClarificationQuestion[] | null {
  if (!content) return null;
  const opens = clarificationOpenLineStarts(content);
  for (let i = opens.length - 1; i >= 0; i--) {
    const bodyStart = bodyStartAfterOpenLine(content, opens[i]!);
    if (bodyStart < 0) continue;
    const inner = innerUntilClosingFence(content, bodyStart);
    if (inner == null) continue;
    try {
      const parsed: unknown = JSON.parse(inner.trim());
      const qs = validateQuestions(parsed);
      if (qs) return qs;
    } catch {
      /* try next open */
    }
  }
  return null;
}

/** True when a valid clarification question set can be read from the message (same as card visibility). */
export function hasClarificationFence(content: string): boolean {
  return parseClarificationQuestions(content) != null;
}
