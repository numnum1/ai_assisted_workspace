/**
 * Parsing for `propose_guided_thread` → ```guided_thread_offer fenced blocks (JSON payload).
 */

const GUIDED_THREAD_OFFER_FENCE_RE = /```guided_thread_offer\s*\n([\s\S]*?)\n```/;

export interface GuidedThreadOfferPayload {
  steeringPlanMarkdown: string;
  threadTitle?: string;
  summary?: string;
  modeId?: string;
  agentPresetId?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function hasGuidedThreadOfferFence(content: string): boolean {
  return GUIDED_THREAD_OFFER_FENCE_RE.test(content);
}

/**
 * Returns parsed payload or null if missing / invalid (e.g. empty plan).
 */
export function parseGuidedThreadOffer(content: string): GuidedThreadOfferPayload | null {
  const m = content.match(GUIDED_THREAD_OFFER_FENCE_RE);
  if (!m) return null;
  try {
    const raw = m[1].trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const plan = parsed.steeringPlanMarkdown;
    if (!isNonEmptyString(plan)) return null;
    const out: GuidedThreadOfferPayload = { steeringPlanMarkdown: plan.trim() };
    if (isNonEmptyString(parsed.threadTitle)) out.threadTitle = parsed.threadTitle.trim();
    if (isNonEmptyString(parsed.summary)) out.summary = parsed.summary.trim();
    if (isNonEmptyString(parsed.modeId)) out.modeId = parsed.modeId.trim();
    if (isNonEmptyString(parsed.agentPresetId)) out.agentPresetId = parsed.agentPresetId.trim();
    return out;
  } catch {
    return null;
  }
}

export function previewSteeringPlan(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trimEnd()}…`;
}
