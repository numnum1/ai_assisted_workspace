import { useState, useCallback, useRef, useMemo } from 'react';
import type { ChapterSummary, ChapterNode, NodeMeta, ScrollTarget } from '../../../shared/types.ts';
import { chapterApi } from '../../../shared/api.ts';

const LAST_POSITION_KEY = 'editor-last-position';

interface StoredPosition {
  projectPath: string;
  /** Subfolder path for subproject structure, or omitted for project root */
  structureRoot?: string | null;
  chapterId: string;
  sceneId?: string;
  actionId?: string;
}

interface ActionContentEntry {
  content: string;
  dirty: boolean;
}

function actionKey(chapterId: string, sceneId: string, actionId: string): string {
  return `${chapterId}/${sceneId}/${actionId}`;
}

export function useChapter() {
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [activeChapter, setActiveChapter] = useState<ChapterNode | null>(null);
  const [actionContents, setActionContents] = useState<Map<string, ActionContentEntry>>(new Map());
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [editorPosition, setEditorPosition] = useState<{ chapterId: string; sceneId?: string; actionId?: string } | null>(null);

  const projectPathRef = useRef('');
  const structureRootRef = useRef<string | null>(null);
  const lastPositionRef = useRef<{ chapterId: string; sceneId?: string; actionId?: string } | null>(null);

  // Per-keystroke edits are buffered here and committed to `actionContents` state on a
  // debounce, so continuous typing does not re-render the whole App tree on every keystroke.
  // `actionContents` is only used to seed the editor's initial doc and to drive dirty
  // indicators — the live text lives in CodeMirror — so a short commit delay is invisible.
  const pendingContentRef = useRef<Map<string, string>>(new Map());
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [structureRoot, setStructureRootState] = useState<string | null>(null);
  const [activeSubprojectType, setActiveSubprojectType] = useState<string | null>(null);

  const sr = useCallback(() => structureRootRef.current ?? undefined, []);

  const setProjectPath = useCallback((path: string) => {
    projectPathRef.current = path;
  }, []);

  /**
   * Sets the folder path for chapter/book APIs (subproject root). Optional subprojectType drives workspace YAML (book, music, …).
   */
  const setStructureRoot = useCallback((relativePath: string | null, subprojectType?: string | null) => {
    const root = relativePath && relativePath !== '.' ? relativePath : null;
    structureRootRef.current = root;
    setStructureRootState(root);
    if (!root) {
      setActiveSubprojectType(null);
    } else if (subprojectType != null && subprojectType !== '') {
      setActiveSubprojectType(subprojectType);
    }
  }, []);

  const persistPosition = useCallback(() => {
    if (!lastPositionRef.current || !projectPathRef.current) return;
    try {
      const pos: StoredPosition = {
        projectPath: projectPathRef.current,
        structureRoot: structureRootRef.current,
        ...lastPositionRef.current,
      };
      localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(pos));
    } catch { /* ignore */ }
  }, []);

  /** Reads the raw stored position for a project, regardless of the currently active structure root. */
  const peekLastPosition = useCallback((projectPath: string): StoredPosition | null => {
    try {
      const raw = localStorage.getItem(LAST_POSITION_KEY);
      if (!raw) return null;
      const pos = JSON.parse(raw) as StoredPosition;
      if (pos.projectPath !== projectPath) return null;
      return pos;
    } catch {
      return null;
    }
  }, []);

  const restoreLastPosition = useCallback(
    (projectPath: string, structureRoot?: string | null): { chapterId: string; scrollTarget: ScrollTarget | null } | null => {
      const pos = peekLastPosition(projectPath);
      if (!pos) return null;
      const rootNorm = structureRoot && structureRoot !== '.' ? structureRoot : null;
      const posRoot = pos.structureRoot && pos.structureRoot !== '.' ? pos.structureRoot : null;
      if (rootNorm !== posRoot) return null;
      const target = (pos.sceneId || pos.actionId)
        ? { sceneId: pos.sceneId, actionId: pos.actionId }
        : null;
      return { chapterId: pos.chapterId, scrollTarget: target };
    },
    [peekLastPosition],
  );

  // ─── Chapter list ──────────────────────────────────────────────────────────

  const refreshChapters = useCallback(async (): Promise<ChapterSummary[]> => {
    try {
      const list = await chapterApi.list(sr());
      setChapters(list);
      return list;
    } catch (err) {
      console.error('Failed to load chapters:', err);
      return [];
    }
  }, [sr]);

  // ─── Open chapter ──────────────────────────────────────────────────────────

  const openChapter = useCallback(async (id: string, initialScrollTarget?: ScrollTarget | null) => {
    const root = sr();
    try {
      const chapter = await chapterApi.getStructure(id, root);

      const entries: Array<[string, ActionContentEntry]> = [];
      await Promise.all(
        chapter.scenes.flatMap(scene =>
          scene.actions.map(async action => {
            try {
              const { content } = await chapterApi.getActionContent(chapter.id, scene.id, action.id, root);
              entries.push([actionKey(chapter.id, scene.id, action.id), { content, dirty: false }]);
            } catch {
              entries.push([actionKey(chapter.id, scene.id, action.id), { content: '', dirty: false }]);
            }
          })
        )
      );

      lastPositionRef.current = {
        chapterId: id,
        sceneId: initialScrollTarget?.sceneId,
        actionId: initialScrollTarget?.actionId,
      };
      persistPosition();

      pendingContentRef.current.clear();
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      setActiveChapter(chapter);
      setActionContents(new Map(entries));
      setEditorPosition({ chapterId: id, sceneId: initialScrollTarget?.sceneId, actionId: initialScrollTarget?.actionId });
      if (initialScrollTarget) setScrollTarget(initialScrollTarget);
    } catch (err) {
      console.error('Failed to open chapter:', err);
    }
  }, [persistPosition, sr]);

  // ─── Action content management ─────────────────────────────────────────────

  /** Flush buffered edits into state. Returns immediately if nothing is pending. */
  const commitPendingContent = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (pendingContentRef.current.size === 0) return;
    const pending = pendingContentRef.current;
    pendingContentRef.current = new Map();
    setActionContents(prev => {
      const next = new Map(prev);
      for (const [key, content] of pending) {
        next.set(key, { content, dirty: true });
      }
      return next;
    });
  }, []);

  const updateActionContent = useCallback((chapterId: string, sceneId: string, actionId: string, content: string) => {
    const key = actionKey(chapterId, sceneId, actionId);
    pendingContentRef.current.set(key, content);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitPendingContent, 250);
  }, [commitPendingContent]);

  const saveAction = useCallback(async (chapterId: string, sceneId: string, actionId: string) => {
    const key = actionKey(chapterId, sceneId, actionId);
    const entry = actionContents.get(key);
    // Prefer the live buffer: the latest keystrokes may not be committed to state yet.
    const pending = pendingContentRef.current.get(key);
    const content = pending ?? entry?.content;
    const isDirty = pending !== undefined || entry?.dirty;
    if (content === undefined || !isDirty) return;
    const root = sr();
    try {
      await chapterApi.saveActionContent(chapterId, sceneId, actionId, content, root);
      pendingContentRef.current.delete(key);
      setActionContents(prev => {
        const next = new Map(prev);
        next.set(key, { content, dirty: false });
        return next;
      });
    } catch (err) {
      console.error('Failed to save action:', err);
    }
  }, [actionContents, sr]);

  const saveAllDirty = useCallback(async () => {
    if (!activeChapter) return;
    const root = sr();
    const saves: Promise<void>[] = [];
    for (const scene of activeChapter.scenes) {
      for (const action of scene.actions) {
        const key = actionKey(activeChapter.id, scene.id, action.id);
        const entry = actionContents.get(key);
        // Prefer the live buffer over committed state for the latest keystrokes.
        const pending = pendingContentRef.current.get(key);
        const content = pending ?? entry?.content;
        const isDirty = pending !== undefined || entry?.dirty;
        if (isDirty && content !== undefined) {
          saves.push(
            chapterApi.saveActionContent(activeChapter.id, scene.id, action.id, content, root)
              .then(() => {
                pendingContentRef.current.delete(key);
                setActionContents(prev => {
                  const next = new Map(prev);
                  next.set(key, { content, dirty: false });
                  return next;
                });
              })
              .catch(err => console.error('Failed to save action:', err))
          );
        }
      }
    }
    await Promise.all(saves);
  }, [activeChapter, actionContents, sr]);

  const hasDirtyActions = useMemo(
    () => Array.from(actionContents.values()).some(e => e.dirty),
    [actionContents],
  );

  // ─── Scroll ───────────────────────────────────────────────────────────────

  const scrollTo = useCallback((target: ScrollTarget) => {
    setScrollTarget(target);
    setEditorPosition(prev => prev ? { chapterId: prev.chapterId, ...target } : null);
    if (lastPositionRef.current) {
      lastPositionRef.current = { chapterId: lastPositionRef.current.chapterId, ...target };
      persistPosition();
    }
  }, [persistPosition]);

  const updateEditorPosition = useCallback((sceneId: string, actionId: string) => {
    setEditorPosition(prev => prev ? { chapterId: prev.chapterId, sceneId, actionId } : null);
    if (lastPositionRef.current) {
      lastPositionRef.current = { chapterId: lastPositionRef.current.chapterId, sceneId, actionId };
      persistPosition();
    }
  }, [persistPosition]);

  const clearScrollTarget = useCallback(() => {
    setScrollTarget(null);
  }, []);

  // ─── Chapter CRUD ──────────────────────────────────────────────────────────

  const createChapter = useCallback(async (title: string) => {
    const root = sr();
    try {
      await chapterApi.create(title, root);
      await refreshChapters();
    } catch (err) {
      console.error('Failed to create chapter:', err);
    }
  }, [refreshChapters, sr]);

  const deleteChapter = useCallback(async (id: string) => {
    const root = sr();
    try {
      await chapterApi.delete(id, root);
      if (activeChapter?.id === id) {
        setActiveChapter(null);
        setActionContents(new Map());
      }
      await refreshChapters();
    } catch (err) {
      console.error('Failed to delete chapter:', err);
    }
  }, [activeChapter, refreshChapters, sr]);

  const updateChapterMeta = useCallback(async (chapterId: string, meta: NodeMeta) => {
    const root = sr();
    try {
      await chapterApi.updateMeta(chapterId, meta, root);
      setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, meta } : c));
      if (activeChapter?.id === chapterId) {
        setActiveChapter(prev => prev ? { ...prev, meta } : prev);
      }
    } catch (err) {
      console.error('Failed to update chapter meta:', err);
    }
  }, [activeChapter, sr]);

  // ─── Scene CRUD ───────────────────────────────────────────────────────────

  const createScene = useCallback(async (chapterId: string, title: string) => {
    const root = sr();
    try {
      await chapterApi.createScene(chapterId, title, root);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to create scene:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const deleteScene = useCallback(async (chapterId: string, sceneId: string) => {
    const root = sr();
    try {
      await chapterApi.deleteScene(chapterId, sceneId, root);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to delete scene:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const updateSceneMeta = useCallback(async (chapterId: string, sceneId: string, meta: NodeMeta) => {
    const root = sr();
    try {
      await chapterApi.updateSceneMeta(chapterId, sceneId, meta, root);
      if (activeChapter?.id === chapterId) {
        setActiveChapter(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, meta } : s),
          };
        });
      }
    } catch (err) {
      console.error('Failed to update scene meta:', err);
    }
  }, [activeChapter, sr]);

  // ─── Action CRUD ───────────────────────────────────────────────────────────

  const createAction = useCallback(async (chapterId: string, sceneId: string, title: string) => {
    const root = sr();
    try {
      await chapterApi.createAction(chapterId, sceneId, title, root);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to create action:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const deleteAction = useCallback(async (chapterId: string, sceneId: string, actionId: string) => {
    const root = sr();
    try {
      await chapterApi.deleteAction(chapterId, sceneId, actionId, root);
      const key = actionKey(chapterId, sceneId, actionId);
      pendingContentRef.current.delete(key);
      setActionContents(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to delete action:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const updateActionMeta = useCallback(async (chapterId: string, sceneId: string, actionId: string, meta: NodeMeta) => {
    const root = sr();
    try {
      await chapterApi.updateActionMeta(chapterId, sceneId, actionId, meta, root);
      if (activeChapter?.id === chapterId) {
        setActiveChapter(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId
                ? { ...s, actions: s.actions.map(a => a.id === actionId ? { ...a, meta } : a) }
                : s
            ),
          };
        });
      }
    } catch (err) {
      console.error('Failed to update action meta:', err);
    }
  }, [activeChapter, sr]);

  // ─── Reorder ──────────────────────────────────────────────────────────────

  const reorderScenes = useCallback(async (chapterId: string, orderedIds: string[]) => {
    const root = sr();
    try {
      await chapterApi.reorderScenes(chapterId, orderedIds, root);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to reorder scenes:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const reorderActions = useCallback(async (chapterId: string, sceneId: string, orderedIds: string[]) => {
    const root = sr();
    try {
      await chapterApi.reorderActions(chapterId, sceneId, orderedIds, root);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to reorder actions:', err);
    }
  }, [activeChapter, openChapter, sr]);

  const closeChapter = useCallback(() => {
    pendingContentRef.current.clear();
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setActiveChapter(null);
    setActionContents(new Map());
    setEditorPosition(null);
    structureRootRef.current = null;
    setStructureRootState(null);
    setActiveSubprojectType(null);
  }, []);

  return {
    chapters,
    refreshChapters,
    activeChapter,
    openChapter,
    closeChapter,
    setProjectPath,
    setStructureRoot,
    structureRoot,
    activeSubprojectType,
    restoreLastPosition,
    peekLastPosition,
    actionContents,
    updateActionContent,
    saveAction,
    saveAllDirty,
    hasDirtyActions,
    scrollTarget,
    scrollTo,
    clearScrollTarget,
    editorPosition,
    updateEditorPosition,
    createChapter,
    deleteChapter,
    updateChapterMeta,
    createScene,
    deleteScene,
    updateSceneMeta,
    createAction,
    deleteAction,
    updateActionMeta,
    reorderScenes,
    reorderActions,
  };
}
