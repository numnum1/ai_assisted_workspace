import { useState, useCallback, useEffect } from 'react';
import { projectApi } from '../api.ts';

const LAST_PROJECT_STORAGE_KEY = 'assistant-last-project-path';

function loadLastProjectPath(): string {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
    return raw?.trim() ?? '';
  } catch {
    return '';
  }
}

function saveLastProjectPath(path: string): void {
  try {
    const p = path?.trim() ?? '';
    if (!p) return;
    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

function clearLastProjectPath(): void {
  try {
    localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useProject() {
  const [projectPath, setProjectPath] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await projectApi.current();
        if (cancelled) return;
        if (info.hasProject && info.path?.trim()) {
          setProjectPath(info.path);
          setInitialized(info.initialized ?? false);
          saveLastProjectPath(info.path);
          return;
        }
        const last = loadLastProjectPath();
        if (!last) return;
        try {
          const result = await projectApi.open(last);
          if (cancelled) return;
          setProjectPath(result.path);
          setInitialized(result.initialized ?? false);
          saveLastProjectPath(result.path);
        } catch (err) {
          clearLastProjectPath();
          console.error('Failed to restore last project:', err);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openProject = useCallback(async (path: string) => {
    const result = await projectApi.open(path);
    saveLastProjectPath(result.path);
    setProjectPath(result.path);
    setInitialized(result.initialized ?? false);
  }, []);

  return {
    projectPath,
    initialized,
    openProject,
  };
}
