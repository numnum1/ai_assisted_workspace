/**
 * Shared types and parsing for `ask_clarification` / ```clarification fenced blocks.
 */

export interface ClarificationQuestion {
  question: string;
  options: string[];
  allow_multiple?: boolean;
}

const CLARIFICATION_FENCE_RE = /```clarification\s*\n([\s\S]*?)\n```/;

export function parseClarificationQuestions(content: string): ClarificationQuestion[] | null {
  const m = content.match(CLARIFICATION_FENCE_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) {
      const arr = parsed.filter(
        (q) => q && typeof q.question === 'string' && Array.isArray(q.options),
      ) as ClarificationQuestion[];
      return arr.length > 0 ? arr : null;
    }
    if (parsed && typeof parsed.question === 'string' && Array.isArray(parsed.options)) {
      return [parsed as ClarificationQuestion];
    }
    return null;
  } catch {
    return null;
  }
}

export function hasClarificationFence(content: string): boolean {
  return CLARIFICATION_FENCE_RE.test(content);
}
