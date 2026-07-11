import { useState, useCallback, useEffect } from 'react';
import { filesApi } from '../api.ts';

export interface FileTab {
  path: string;
  content: string;
  dirty: boolean;
}

export interface PendingEditorScroll {
  line: number;
  nonce: number;
}

const LAST_FILE_STORAGE_KEY = 'assistant-last-file-path';

function loadLastFilePath(projectPath: string): string | null {
  try {
    const raw = localStorage.getItem(LAST_FILE_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[projectPath]?.trim() || null;
  } catch {
    return null;
  }
}

function saveLastFilePath(projectPath: string, path: string | null): void {
  try {
    const raw = localStorage.getItem(LAST_FILE_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    if (path) {
      map[projectPath] = path;
    } else {
      delete map[projectPath];
    }
    localStorage.setItem(LAST_FILE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function useFileTabs(projectPath: string | null) {
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<PendingEditorScroll | null>(null);

  useEffect(() => {
    setTabs([]);
    setActiveTabPath(null);
    setError(null);
    setPendingScroll(null);
    if (!projectPath) return;
    const lastPath = loadLastFilePath(projectPath);
    if (!lastPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await filesApi.getContent(lastPath);
        if (cancelled) return;
        setTabs((prev) =>
          prev.find((t) => t.path === lastPath)
            ? prev
            : [...prev, { path: lastPath, content: res.content, dirty: false }],
        );
        setActiveTabPath(lastPath);
      } catch {
        /* file may have been deleted or moved since last session; ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath) return;
    saveLastFilePath(projectPath, activeTabPath);
  }, [projectPath, activeTabPath]);

  const activeTab = tabs.find((t) => t.path === activeTabPath) ?? null;
  const selectedPath = activeTabPath;
  const content = activeTab?.content ?? '';
  const dirty = activeTab?.dirty ?? false;

  const openFile = useCallback(
    async (path: string, line?: number) => {
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActiveTabPath(path);
        if (line != null && Number.isFinite(line)) {
          setPendingScroll({ line: Math.trunc(line), nonce: Date.now() });
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await filesApi.getContent(path);
        setTabs((prev) => {
          if (prev.find((t) => t.path === path)) {
            return prev;
          }
          return [...prev, { path, content: res.content, dirty: false }];
        });
        setActiveTabPath(path);
        if (line != null && Number.isFinite(line)) {
          setPendingScroll({ line: Math.trunc(line), nonce: Date.now() });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Datei konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    },
    [tabs],
  );

  const clearPendingScroll = useCallback(() => {
    setPendingScroll(null);
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (tab?.dirty) {
        if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
      }
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        if (activeTabPath === path) {
          const idx = prev.findIndex((t) => t.path === path);
          const nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null;
          setActiveTabPath(nextActive);
        }
        return next;
      });
    },
    [tabs, activeTabPath],
  );

  const closeFile = useCallback(() => {
    if (activeTabPath) closeTab(activeTabPath);
  }, [activeTabPath, closeTab]);

  const closeOtherTabs = useCallback(
    (keepPath: string) => {
      const others = tabs.filter((t) => t.path !== keepPath);
      if (others.length === 0) return;
      if (others.some((t) => t.dirty)) {
        if (!window.confirm('Ungespeicherte Änderungen in den anderen Tabs verwerfen?')) return;
      }
      setTabs((prev) => prev.filter((t) => t.path === keepPath));
      setActiveTabPath(keepPath);
    },
    [tabs],
  );

  const closeAllTabs = useCallback(() => {
    if (tabs.length === 0) return;
    if (tabs.some((t) => t.dirty)) {
      if (!window.confirm('Ungespeicherte Änderungen in allen Tabs verwerfen?')) return;
    }
    setTabs([]);
    setActiveTabPath(null);
  }, [tabs]);

  const setContent = useCallback((next: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.path === activeTabPath ? { ...t, content: next, dirty: true } : t,
      ),
    );
  }, [activeTabPath]);

  const save = useCallback(async () => {
    if (!activeTabPath || !activeTab) return;
    setLoading(true);
    setError(null);
    try {
      await filesApi.saveContent(activeTabPath, activeTab.content);
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTabPath ? { ...t, dirty: false } : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [activeTabPath, activeTab]);

  const syncWithFilesystem = useCallback(
    (event: { deleted?: string; renamed?: { from: string; to: string } }) => {
      if (event.deleted) {
        const p = event.deleted;
        setTabs((prev) => {
          const next = prev.filter(
            (t) => t.path !== p && !t.path.startsWith(`${p}/`),
          );
          if (next.length !== prev.length && activeTabPath) {
            const wasActive =
              activeTabPath === p || activeTabPath.startsWith(`${p}/`);
            if (wasActive) {
              const idx = prev.findIndex((t) => t.path === activeTabPath);
              const nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null;
              setActiveTabPath(nextActive);
            }
          }
          return next;
        });
      }
      if (event.renamed) {
        const { from, to } = event.renamed;
        setTabs((prev) =>
          prev.map((t) => {
            if (t.path === from) return { ...t, path: to };
            if (t.path.startsWith(`${from}/`))
              return { ...t, path: to + t.path.slice(from.length) };
            return t;
          }),
        );
        if (activeTabPath === from) setActiveTabPath(to);
        else if (activeTabPath?.startsWith(`${from}/`))
          setActiveTabPath(to + activeTabPath.slice(from.length));
      }
    },
    [activeTabPath],
  );

  return {
    tabs,
    activeTabPath,
    selectedPath,
    content,
    dirty,
    loading,
    error,
    openFile,
    pendingScroll,
    clearPendingScroll,
    closeFile,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    save,
    setContent,
    clearError: () => setError(null),
    syncWithFilesystem,
  };
}
