import { useState, useCallback, useRef } from 'react';
import type { ChapterSummary, ChapterNode, NodeMeta, ScrollTarget } from '../types.ts';
import { chapterApi } from '../api.ts';

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

  const sr = useCallback(() => structureRootRef.current ?? undefined, []);

  const setProjectPath = useCallback((path: string) => {
    projectPathRef.current = path;
  }, []);

  const setStructureRoot = useCallback((relativePath: string | null) => {
    structureRootRef.current = relativePath && relativePath !== '.' ? relativePath : null;
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

  const restoreLastPosition = useCallback(
    (projectPath: string, structureRoot?: string | null): { chapterId: string; scrollTarget: ScrollTarget | null } | null => {
      try {
        const raw = localStorage.getItem(LAST_POSITION_KEY);
        if (!raw) return null;
        const pos = JSON.parse(raw) as StoredPosition;
        if (pos.projectPath !== projectPath) return null;
        const rootNorm = structureRoot && structureRoot !== '.' ? structureRoot : null;
        const posRoot = pos.structureRoot && pos.structureRoot !== '.' ? pos.structureRoot : null;
        if (rootNorm !== posRoot) return null;
        const target = (pos.sceneId || pos.actionId)
          ? { sceneId: pos.sceneId, actionId: pos.actionId }
          : null;
        return { chapterId: pos.chapterId, scrollTarget: target };
      } catch {
        return null;
      }
    },
    [],
  );

  // ─── Chapter list ──────────────────────────────────────────────────────────

  const refreshChapters = useCallback(async () => {
    try {
      const list = await chapterApi.list(sr());
      setChapters(list);
    } catch (err) {
      console.error('Failed to load chapters:', err);
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

      setActiveChapter(chapter);
      setActionContents(new Map(entries));
      setEditorPosition({ chapterId: id, sceneId: initialScrollTarget?.sceneId, actionId: initialScrollTarget?.actionId });
      if (initialScrollTarget) setScrollTarget(initialScrollTarget);
    } catch (err) {
      console.error('Failed to open chapter:', err);
    }
  }, [persistPosition, sr]);

  // ─── Action content management ─────────────────────────────────────────────

  const updateActionContent = useCallback((chapterId: string, sceneId: string, actionId: string, content: string) => {
    const key = actionKey(chapterId, sceneId, actionId);
    setActionContents(prev => {
      const next = new Map(prev);
      next.set(key, { content, dirty: true });
      return next;
    });
  }, []);

  const saveAction = useCallback(async (chapterId: string, sceneId: string, actionId: string) => {
    const key = actionKey(chapterId, sceneId, actionId);
    const entry = actionContents.get(key);
    if (!entry || !entry.dirty) return;
    const root = sr();
    try {
      await chapterApi.saveActionContent(chapterId, sceneId, actionId, entry.content, root);
      setActionContents(prev => {
        const next = new Map(prev);
        next.set(key, { ...entry, dirty: false });
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
        if (entry?.dirty) {
          saves.push(
            chapterApi.saveActionContent(activeChapter.id, scene.id, action.id, entry.content, root)
              .then(() => {
                setActionContents(prev => {
                  const next = new Map(prev);
                  next.set(key, { ...entry, dirty: false });
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

  const hasDirtyActions = Array.from(actionContents.values()).some(e => e.dirty);

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
    setActiveChapter(null);
    setActionContents(new Map());
  }, []);

  return {
    chapters,
    refreshChapters,
    activeChapter,
    openChapter,
    closeChapter,
    setProjectPath,
    setStructureRoot,
    restoreLastPosition,
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
