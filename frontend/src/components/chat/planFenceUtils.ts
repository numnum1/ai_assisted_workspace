/**
 * Extract markdown from assistant messages: fenced ```plan blocks (full updated steering plan).
 */

const PLAN_FENCE_RE = /```plan\s*\n?([\s\S]*?)\n?```/;

export function parseSteeringPlanFromAssistant(content: string): string | null {
  if (!content) return null;
  const m = content.match(PLAN_FENCE_RE);
  if (!m) return null;
  const inner = m[1]?.trim();
  return inner && inner.length > 0 ? inner : null;
}
