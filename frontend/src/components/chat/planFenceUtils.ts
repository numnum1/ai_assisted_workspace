/**
 * Extract markdown from assistant messages: fenced ```plan blocks (full updated steering plan).
 */

const PLAN_FENCE_RE = /```plan\s*\n?([\s\S]*?)\n?```/;
const PLAN_FENCE_RE_GLOBAL = new RegExp(PLAN_FENCE_RE.source, 'g');

/** Opening fence for a steering plan block (language tag exactly `plan`). */
const PLAN_OPEN_RE = /```plan\b/;

/**
 * Removes ```plan … ``` from markdown shown in the chat bubble (plan is shown in the Arbeitsplan panel).
 * When streaming, truncates from an opening ```plan if the closing fence has not arrived yet.
 */
export function stripPlanFencesForDisplay(content: string, streaming: boolean): string {
  if (!content) return content;
  let s = content.replace(PLAN_FENCE_RE_GLOBAL, '');
  if (streaming) {
    const m = s.match(PLAN_OPEN_RE);
    if (m?.index !== undefined) {
      s = s.slice(0, m.index).replace(/\s+$/, '');
    }
  }
  return s;
}

export function parseSteeringPlanFromAssistant(content: string): string | null {
  if (!content) return null;
  const m = content.match(PLAN_FENCE_RE);
  if (!m) return null;
  const inner = m[1]?.trim();
  return inner && inner.length > 0 ? inner : null;
}
