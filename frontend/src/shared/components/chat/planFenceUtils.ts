/**
 * Extract markdown from assistant messages: fenced ```artifact blocks (working-note fences).
 */

/** Opening fence for an artifact working-note block. */
const ARTIFACT_OPEN_RE = /```artifact\b/;

/**
 * Removes streaming-in-progress ```artifact fences from markdown shown in the chat bubble.
 * When streaming, truncates from an opening ```artifact if the closing fence has not arrived yet.
 */
export function stripPlanFencesForDisplay(content: string, streaming: boolean): string {
  if (!content) return content;
  let s = content;
  if (streaming) {
    const artifactOpen = s.match(ARTIFACT_OPEN_RE);
    if (artifactOpen?.index !== undefined) {
      s = s.slice(0, artifactOpen.index).replace(/\s+$/, '');
    }
  }
  return s;
}
