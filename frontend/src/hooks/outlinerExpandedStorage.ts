const STORAGE_KEY = 'markdown_assistant_outliner_expanded_v1';

/** Composite key: same project can differ by scoped vs full tree root. */
function mapKey(projectPath: string, scopeToPath: string | null): string {
  return `${projectPath}\0${scopeToPath ?? ''}`;
}

function readMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = v as string[];
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Last expanded folder paths (project-relative), for a project and optional outliner scope.
 */
export function readExpandedPaths(projectPath: string, scopeToPath: string | null): string[] {
  const key = mapKey(projectPath, scopeToPath);
  return readMap()[key] ?? [];
}

export function writeExpandedPaths(
  projectPath: string,
  scopeToPath: string | null,
  paths: Iterable<string>,
): void {
  try {
    const map = readMap();
    const key = mapKey(projectPath, scopeToPath);
    const arr = [...paths];
    if (arr.length === 0) {
      delete map[key];
    } else {
      map[key] = arr;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
