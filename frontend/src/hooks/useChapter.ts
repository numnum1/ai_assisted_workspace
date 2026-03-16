import { useState, useCallback } from 'react';
import type { ChapterSummary, ChapterNode, NodeMeta, ScrollTarget } from '../types.ts';
import { chapterApi } from '../api.ts';

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

  // ─── Chapter list ──────────────────────────────────────────────────────────

  const refreshChapters = useCallback(async () => {
    try {
      const list = await chapterApi.list();
      setChapters(list);
    } catch (err) {
      console.error('Failed to load chapters:', err);
    }
  }, []);

  // ─── Open chapter ──────────────────────────────────────────────────────────

  const openChapter = useCallback(async (id: string) => {
    try {
      const chapter = await chapterApi.getStructure(id);
      setActiveChapter(chapter);
      setActionContents(new Map());

      // Load all action contents in parallel
      const entries: Array<[string, ActionContentEntry]> = [];
      await Promise.all(
        chapter.scenes.flatMap(scene =>
          scene.actions.map(async action => {
            try {
              const { content } = await chapterApi.getActionContent(chapter.id, scene.id, action.id);
              entries.push([actionKey(chapter.id, scene.id, action.id), { content, dirty: false }]);
            } catch {
              entries.push([actionKey(chapter.id, scene.id, action.id), { content: '', dirty: false }]);
            }
          })
        )
      );

      setActionContents(new Map(entries));
    } catch (err) {
      console.error('Failed to open chapter:', err);
    }
  }, []);

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
    try {
      await chapterApi.saveActionContent(chapterId, sceneId, actionId, entry.content);
      setActionContents(prev => {
        const next = new Map(prev);
        next.set(key, { ...entry, dirty: false });
        return next;
      });
    } catch (err) {
      console.error('Failed to save action:', err);
    }
  }, [actionContents]);

  const saveAllDirty = useCallback(async () => {
    if (!activeChapter) return;
    const saves: Promise<void>[] = [];
    for (const scene of activeChapter.scenes) {
      for (const action of scene.actions) {
        const key = actionKey(activeChapter.id, scene.id, action.id);
        const entry = actionContents.get(key);
        if (entry?.dirty) {
          saves.push(
            chapterApi.saveActionContent(activeChapter.id, scene.id, action.id, entry.content)
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
  }, [activeChapter, actionContents]);

  const hasDirtyActions = Array.from(actionContents.values()).some(e => e.dirty);

  // ─── Scroll ────────────────────────────────────────────────────────────────

  const scrollTo = useCallback((target: ScrollTarget) => {
    setScrollTarget(target);
  }, []);

  const clearScrollTarget = useCallback(() => {
    setScrollTarget(null);
  }, []);

  // ─── Chapter CRUD ──────────────────────────────────────────────────────────

  const createChapter = useCallback(async (title: string) => {
    try {
      await chapterApi.create(title);
      await refreshChapters();
    } catch (err) {
      console.error('Failed to create chapter:', err);
    }
  }, [refreshChapters]);

  const deleteChapter = useCallback(async (id: string) => {
    try {
      await chapterApi.delete(id);
      if (activeChapter?.id === id) {
        setActiveChapter(null);
        setActionContents(new Map());
      }
      await refreshChapters();
    } catch (err) {
      console.error('Failed to delete chapter:', err);
    }
  }, [activeChapter, refreshChapters]);

  const updateChapterMeta = useCallback(async (chapterId: string, meta: NodeMeta) => {
    try {
      await chapterApi.updateMeta(chapterId, meta);
      setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, meta } : c));
      if (activeChapter?.id === chapterId) {
        setActiveChapter(prev => prev ? { ...prev, meta } : prev);
      }
    } catch (err) {
      console.error('Failed to update chapter meta:', err);
    }
  }, [activeChapter]);

  // ─── Scene CRUD ────────────────────────────────────────────────────────────

  const createScene = useCallback(async (chapterId: string, title: string) => {
    try {
      await chapterApi.createScene(chapterId, title);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to create scene:', err);
    }
  }, [activeChapter, openChapter]);

  const deleteScene = useCallback(async (chapterId: string, sceneId: string) => {
    try {
      await chapterApi.deleteScene(chapterId, sceneId);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to delete scene:', err);
    }
  }, [activeChapter, openChapter]);

  const updateSceneMeta = useCallback(async (chapterId: string, sceneId: string, meta: NodeMeta) => {
    try {
      await chapterApi.updateSceneMeta(chapterId, sceneId, meta);
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
  }, [activeChapter]);

  // ─── Action CRUD ───────────────────────────────────────────────────────────

  const createAction = useCallback(async (chapterId: string, sceneId: string, title: string) => {
    try {
      await chapterApi.createAction(chapterId, sceneId, title);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to create action:', err);
    }
  }, [activeChapter, openChapter]);

  const deleteAction = useCallback(async (chapterId: string, sceneId: string, actionId: string) => {
    try {
      await chapterApi.deleteAction(chapterId, sceneId, actionId);
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
  }, [activeChapter, openChapter]);

  const updateActionMeta = useCallback(async (chapterId: string, sceneId: string, actionId: string, meta: NodeMeta) => {
    try {
      await chapterApi.updateActionMeta(chapterId, sceneId, actionId, meta);
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
  }, [activeChapter]);

  // ─── Reorder ──────────────────────────────────────────────────────────────

  const reorderScenes = useCallback(async (chapterId: string, orderedIds: string[]) => {
    try {
      await chapterApi.reorderScenes(chapterId, orderedIds);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to reorder scenes:', err);
    }
  }, [activeChapter, openChapter]);

  const reorderActions = useCallback(async (chapterId: string, sceneId: string, orderedIds: string[]) => {
    try {
      await chapterApi.reorderActions(chapterId, sceneId, orderedIds);
      if (activeChapter?.id === chapterId) {
        await openChapter(chapterId);
      }
    } catch (err) {
      console.error('Failed to reorder actions:', err);
    }
  }, [activeChapter, openChapter]);

  return {
    chapters,
    refreshChapters,
    activeChapter,
    openChapter,
    actionContents,
    updateActionContent,
    saveAction,
    saveAllDirty,
    hasDirtyActions,
    scrollTarget,
    scrollTo,
    clearScrollTarget,
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
