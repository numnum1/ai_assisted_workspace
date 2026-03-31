import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'markdown_assistant_outliner_scope_v1';

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writePathForProject(projectPath: string, relativeSubprojectPath: string | null) {
  try {
    const map = readMap();
    if (relativeSubprojectPath == null || relativeSubprojectPath === '') {
      delete map[projectPath];
    } else {
      map[projectPath] = relativeSubprojectPath;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Persisted per absolute project folder: relative path of subproject folder to show as outliner root, or null for full tree.
 */
export function useOutlinerScope(projectPath: string | null) {
  const [scopePath, setScopePathState] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setScopePathState(null);
      return;
    }
    const map = readMap();
    const saved = map[projectPath]?.trim();
    setScopePathState(saved && saved.length > 0 ? saved : null);
  }, [projectPath]);

  const setScopePath = useCallback(
    (relativePath: string | null) => {
      if (!projectPath) return;
      const next = relativePath?.trim() || null;
      setScopePathState(next && next.length > 0 ? next : null);
      writePathForProject(projectPath, next && next.length > 0 ? next : null);
    },
    [projectPath],
  );

  const clearScopePath = useCallback(() => {
    setScopePath(null);
  }, [setScopePath]);

  return { scopePath, setScopePath, clearScopePath };
}

