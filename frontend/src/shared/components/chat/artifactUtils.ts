const ARTIFACT_FENCE_RE = /```artifact\s*\n([\s\S]*?)\n```/;

export interface ArtifactPayload {
  title: string;
  id?: string;
  content: string;
}

export function hasArtifactFence(content: string): boolean {
  return ARTIFACT_FENCE_RE.test(content);
}

/**
 * Parse an artifact payload from the raw content between the fence markers.
 * The first non-empty line is expected to be a JSON object with at least { title }.
 * All remaining lines form the markdown content body.
 */
export function parseArtifactFromRaw(raw: string): ArtifactPayload {
  const lines = raw.split('\n');
  let title = 'Arbeitsnotiz';
  let id: string | undefined;
  let contentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const meta = JSON.parse(line) as Record<string, unknown>;
      if (meta && typeof meta === 'object') {
        if (typeof meta.title === 'string' && meta.title.trim()) {
          title = meta.title.trim();
        }
        if (typeof meta.id === 'string' && meta.id.trim()) {
          id = meta.id.trim();
        }
        contentStart = i + 1;
      }
    } catch {
      // First non-empty line is not JSON — treat everything as content
    }
    break;
  }

  const content = lines
    .slice(contentStart)
    .join('\n')
    .replace(/^\n+/, ''); // strip leading blank lines after metadata

  return { title, id, content };
}
