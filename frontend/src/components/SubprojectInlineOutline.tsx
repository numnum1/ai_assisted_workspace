import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { ChapterSummary, ChapterNode, MetaSelection, OutlinerLevelConfig, ScrollTarget } from '../types.ts';
import { chapterApi } from '../api.ts';
import { OutlinerIcon } from './outlinerIcons.tsx';

type OutlineCtx =
  | { type: 'root' }
  | { type: 'chapter'; chapterId: string }
  | { type: 'scene'; chapterId: string; sceneId: string }
  | { type: 'action'; chapterId: string; sceneId: string; actionId: string };

type OutlineMenuState = { x: number; y: number; ctx: OutlineCtx };

type RenameState =
  | { kind: 'chapter'; chapterId: string; currentTitle: string }
  | { kind: 'scene'; chapterId: string; sceneId: string; currentTitle: string }
  | { kind: 'action'; chapterId: string; sceneId: string; actionId: string; currentTitle: string };

export interface SubprojectInlineOutlineProps {
  subprojectPath: string;
  subprojectType: string;
  levelConfig: OutlinerLevelConfig;
  baseDepth: number;
  chapterSummaries: ChapterSummary[] | null;
  summariesLoading: boolean;
  activeChapterId: string | null;
  activeStructureRoot: string | null;
  editorPosition: { chapterId: string; sceneId?: string; actionId?: string } | null;
  onStructureMutated: () => void;
  /** Open editor at scroll target and show meta for this structure node */
  onActivateNode: (chapterId: string, scroll: ScrollTarget | null, selection: MetaSelection) => void;
  runWithRoot: (fn: () => Promise<void>) => Promise<void>;
}

function padLeft(depth: number): number {
  return 8 + depth * 14;
}

export function SubprojectInlineOutline({
  subprojectPath,
  subprojectType,
  levelConfig,
  baseDepth,
  chapterSummaries,
  summariesLoading,
  activeChapterId,
  activeStructureRoot,
  editorPosition,
  onStructureMutated,
  onActivateNode,
  runWithRoot,
}: SubprojectInlineOutlineProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [structures, setStructures] = useState<Map<string, ChapterNode>>(new Map());
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);
  const [menu, setMenu] = useState<OutlineMenuState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const rootActive = activeStructureRoot === subprojectPath;
  const activeSceneId = editorPosition?.sceneId;
  const activeActionId = editorPosition?.actionId;

  const loadStructure = useCallback(
    async (chapterId: string) => {
      setLoadingChapterId(chapterId);
      try {
        const ch = await chapterApi.getStructure(chapterId, subprojectPath);
        setStructures((prev) => {
          const next = new Map(prev);
          next.set(chapterId, ch);
          return next;
        });
      } catch {
        setStructures((prev) => {
          const next = new Map(prev);
          next.delete(chapterId);
          return next;
        });
      } finally {
        setLoadingChapterId((id) => (id === chapterId ? null : id));
      }
    },
    [subprojectPath],
  );

  useEffect(() => {
    setStructures(new Map());
    setExpandedChapters(new Set());
    setExpandedScenes(new Set());
  }, [subprojectPath, subprojectType]);

  useEffect(() => {
    if (!chapterSummaries) return;
    const ids = new Set(chapterSummaries.map((c) => c.id));
    setStructures((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!ids.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [chapterSummaries]);

  useEffect(() => {
    if (!rootActive || !editorPosition?.chapterId) return;
    const cid = editorPosition.chapterId;
    setExpandedChapters((prev) => {
      if (prev.has(cid)) return prev;
      const next = new Set(prev);
      next.add(cid);
      return next;
    });
    // Label/icon click opens editor and expands here; scenes still need a structure fetch (chevron already loads).
    void loadStructure(cid);
  }, [rootActive, editorPosition?.chapterId, loadStructure]);

  useEffect(() => {
    if (!rootActive || !editorPosition?.sceneId || !editorPosition.chapterId) return;
    const key = `${editorPosition.chapterId}-${editorPosition.sceneId}`;
    setExpandedScenes((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, [rootActive, editorPosition?.sceneId, editorPosition?.chapterId]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (renameState && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameState]);

  const toggleScene = useCallback((sceneKey: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneKey)) next.delete(sceneKey);
      else next.add(sceneKey);
      return next;
    });
  }, []);

  const openCtx = useCallback((e: MouseEvent, ctx: OutlineCtx) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, ctx });
  }, []);

  const startRename = useCallback((state: RenameState) => {
    setMenu(null);
    setRenameState(state);
    setRenameValue(state.currentTitle ?? '');
  }, []);

  const commitRename = useCallback(async () => {
    if (!renameState || !renameValue.trim()) {
      setRenameState(null);
      return;
    }
    const title = renameValue.trim();
    await runWithRoot(async () => {
      if (renameState.kind === 'chapter') {
        const list = await chapterApi.list(subprojectPath);
        const c = list.find((x) => x.id === renameState.chapterId);
        if (!c) return;
        await chapterApi.updateMeta(renameState.chapterId, { ...c.meta, title }, subprojectPath);
      } else if (renameState.kind === 'scene') {
        const ch = await chapterApi.getStructure(renameState.chapterId, subprojectPath);
        const s = ch.scenes.find((sc) => sc.id === renameState.sceneId);
        if (!s) return;
        await chapterApi.updateSceneMeta(renameState.chapterId, renameState.sceneId, { ...s.meta, title }, subprojectPath);
      } else {
        const ch = await chapterApi.getStructure(renameState.chapterId, subprojectPath);
        const s = ch.scenes.find((sc) => sc.id === renameState.sceneId);
        const a = s?.actions.find((ac) => ac.id === renameState.actionId);
        if (!s || !a) return;
        await chapterApi.updateActionMeta(
          renameState.chapterId,
          renameState.sceneId,
          renameState.actionId,
          { ...a.meta, title },
          subprojectPath,
        );
      }
    });
    await loadStructure(renameState.chapterId);
    onStructureMutated();
    setRenameState(null);
  }, [renameState, renameValue, runWithRoot, subprojectPath, onStructureMutated, loadStructure]);

  const promptCreate = useCallback(
    async (kind: 'chapter' | 'scene' | 'action', chapterId?: string, sceneId?: string) => {
      setMenu(null);
      const label =
        kind === 'chapter'
          ? levelConfig.chapter.label
          : kind === 'scene'
            ? levelConfig.scene.label
            : levelConfig.action.label;
      const def =
        kind === 'chapter'
          ? levelConfig.chapter.labelNew
          : kind === 'scene'
            ? levelConfig.scene.labelNew
            : levelConfig.action.labelNew;
      const title = window.prompt(`Titel für neue ${label}:`, def);
      if (!title?.trim()) return;
      await runWithRoot(async () => {
        if (kind === 'chapter') await chapterApi.create(title.trim(), subprojectPath);
        else if (kind === 'scene' && chapterId) await chapterApi.createScene(chapterId, title.trim(), subprojectPath);
        else if (kind === 'action' && chapterId && sceneId) {
          await chapterApi.createAction(chapterId, sceneId, title.trim(), subprojectPath);
        }
      });
      if (kind !== 'chapter' && chapterId) await loadStructure(chapterId);
      onStructureMutated();
    },
    [levelConfig, runWithRoot, subprojectPath, onStructureMutated, loadStructure],
  );

  const handleMoveScene = useCallback(
    async (chapterId: string, sceneId: string, direction: 'up' | 'down') => {
      const data = structures.get(chapterId);
      if (!data) return;
      const ids = data.scenes.map((s) => s.id);
      const idx = ids.indexOf(sceneId);
      if (direction === 'up' && idx > 0) {
        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      } else if (direction === 'down' && idx < ids.length - 1) {
        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      } else return;
      await runWithRoot(async () => {
        await chapterApi.reorderScenes(chapterId, ids, subprojectPath);
      });
      await loadStructure(chapterId);
      onStructureMutated();
      setMenu(null);
    },
    [structures, runWithRoot, subprojectPath, loadStructure, onStructureMutated],
  );

  const handleMoveAction = useCallback(
    async (chapterId: string, sceneId: string, actionId: string, direction: 'up' | 'down') => {
      const data = structures.get(chapterId);
      const scene = data?.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const ids = scene.actions.map((a) => a.id);
      const idx = ids.indexOf(actionId);
      if (direction === 'up' && idx > 0) {
        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      } else if (direction === 'down' && idx < ids.length - 1) {
        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      } else return;
      await runWithRoot(async () => {
        await chapterApi.reorderActions(chapterId, sceneId, ids, subprojectPath);
      });
      await loadStructure(chapterId);
      onStructureMutated();
      setMenu(null);
    },
    [structures, runWithRoot, subprojectPath, loadStructure, onStructureMutated],
  );

  const onChapterChevron = useCallback(
    (e: MouseEvent, chapterId: string) => {
      e.stopPropagation();
      setExpandedChapters((prev) => {
        const next = new Set(prev);
        const opening = !next.has(chapterId);
        if (opening) {
          next.add(chapterId);
          void loadStructure(chapterId);
        } else {
          next.delete(chapterId);
        }
        return next;
      });
    },
    [loadStructure],
  );

  if (summariesLoading || chapterSummaries === null) {
    return (
      <div className="file-tree-chapter-loading" style={{ paddingLeft: padLeft(baseDepth + 1) }}>
        Struktur laden…
      </div>
    );
  }

  if (chapterSummaries.length === 0) {
    return (
      <div
        className="file-tree-subproject-outline-root"
        style={{ paddingLeft: padLeft(baseDepth + 1) }}
        onContextMenu={(e) => openCtx(e, { type: 'root' })}
      >
        <span className="file-tree-subproject-outline-hint">Rechtsklick: {levelConfig.chapter.labelNew}</span>
      </div>
    );
  }

  return (
    <div
      className="file-tree-subproject-outline"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.outliner-node')) return;
        openCtx(e, { type: 'root' });
      }}
    >
      {chapterSummaries.map((chapter) => {
        const isOpenChapter = rootActive && activeChapterId === chapter.id;
        const isActiveChapter = isOpenChapter && !activeSceneId && !activeActionId;
        const isExpanded = expandedChapters.has(chapter.id);
        const chapterData = structures.get(chapter.id) ?? null;

        return (
          <div key={chapter.id}>
            <div
              className={`outliner-node outliner-chapter file-tree-subproject-outline-node${isActiveChapter ? ' active' : ''}`}
              style={{ paddingLeft: padLeft(baseDepth + 1) }}
              onContextMenu={(e) => openCtx(e, { type: 'chapter', chapterId: chapter.id })}
            >
              <span className="outliner-arrow outliner-arrow-btn" onClick={(e) => onChapterChevron(e, chapter.id)}>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <span
                className="outliner-type-icon outliner-clickable"
                onClick={() => {
                  onActivateNode(chapter.id, null, { type: 'chapter', chapterId: chapter.id, meta: chapter.meta });
                }}
                role="presentation"
              >
                <OutlinerIcon name={levelConfig.chapter.icon} size={13} />
              </span>
              {renameState?.kind === 'chapter' && renameState.chapterId === chapter.id ? (
                <input
                  ref={renameInputRef}
                  className="outliner-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename();
                    if (e.key === 'Escape') setRenameState(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="outliner-label outliner-clickable"
                  onClick={() => {
                    onActivateNode(chapter.id, null, { type: 'chapter', chapterId: chapter.id, meta: chapter.meta });
                  }}
                >
                  {chapter.meta.title || chapter.id}
                </span>
              )}
              {loadingChapterId === chapter.id && <span className="file-tree-outline-loading"> …</span>}
            </div>

            {isExpanded && chapterData && (
              <>
                {chapterData.scenes.map((scene) => {
                  const sceneKey = `${chapter.id}-${scene.id}`;
                  const isActiveScene = isOpenChapter && activeSceneId === scene.id;
                  const isSceneExpanded = expandedScenes.has(sceneKey);

                  return (
                    <div key={scene.id}>
                      <div
                        className={`outliner-node outliner-scene file-tree-subproject-outline-node${isActiveScene ? ' active' : ''}`}
                        style={{ paddingLeft: padLeft(baseDepth + 2) }}
                        onContextMenu={(e) => openCtx(e, { type: 'scene', chapterId: chapter.id, sceneId: scene.id })}
                      >
                        <span
                          className="outliner-arrow outliner-arrow-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleScene(sceneKey);
                          }}
                        >
                          {isSceneExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span
                          className="outliner-type-icon outliner-clickable"
                          onClick={() => {
                            onActivateNode(chapter.id, { sceneId: scene.id }, {
                              type: 'scene',
                              chapterId: chapter.id,
                              sceneId: scene.id,
                              meta: scene.meta,
                            });
                          }}
                          role="presentation"
                        >
                          <OutlinerIcon name={levelConfig.scene.icon} size={12} />
                        </span>
                        {renameState?.kind === 'scene' && renameState.sceneId === scene.id ? (
                          <input
                            ref={renameInputRef}
                            className="outliner-rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void commitRename()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename();
                              if (e.key === 'Escape') setRenameState(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="outliner-label outliner-clickable"
                            onClick={() => {
                              onActivateNode(chapter.id, { sceneId: scene.id }, {
                                type: 'scene',
                                chapterId: chapter.id,
                                sceneId: scene.id,
                                meta: scene.meta,
                              });
                            }}
                          >
                            {scene.meta.title || scene.id}
                          </span>
                        )}
                      </div>

                      {isSceneExpanded &&
                        scene.actions.map((action) => {
                          const isActiveAction =
                            isOpenChapter && activeSceneId === scene.id && activeActionId === action.id;
                          return (
                            <div
                              key={action.id}
                              className={`outliner-node outliner-action file-tree-subproject-outline-node${isActiveAction ? ' active' : ''}`}
                              style={{ paddingLeft: padLeft(baseDepth + 3) }}
                              onClick={() => {
                                onActivateNode(
                                  chapter.id,
                                  { sceneId: scene.id, actionId: action.id },
                                  {
                                    type: 'action',
                                    chapterId: chapter.id,
                                    sceneId: scene.id,
                                    actionId: action.id,
                                    meta: action.meta,
                                  },
                                );
                              }}
                              onContextMenu={(e) =>
                                openCtx(e, {
                                  type: 'action',
                                  chapterId: chapter.id,
                                  sceneId: scene.id,
                                  actionId: action.id,
                                })
                              }
                            >
                              <span className="outliner-arrow" style={{ width: 13 }} />
                              <OutlinerIcon name={levelConfig.action.icon} size={12} className="outliner-type-icon" />
                              {renameState?.kind === 'action' && renameState.actionId === action.id ? (
                                <input
                                  ref={renameInputRef}
                                  className="outliner-rename-input"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onBlur={() => void commitRename()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void commitRename();
                                    if (e.key === 'Escape') setRenameState(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span className="outliner-label">{action.meta.title || action.id}</span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {menu && (
        <div
          className="file-tree-context-menu file-tree-subproject-outline-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          {menu.ctx.type === 'root' && (
            <button type="button" className="file-tree-context-item" onClick={() => void promptCreate('chapter')}>
              {levelConfig.chapter.labelNew}
            </button>
          )}
          {menu.ctx.type === 'chapter' && (
            <>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void promptCreate('scene', menu.ctx.chapterId)}
              >
                {levelConfig.scene.labelNew}
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => {
                  const ch = chapterSummaries.find((c) => c.id === menu.ctx.chapterId);
                  startRename({ kind: 'chapter', chapterId: menu.ctx.chapterId, currentTitle: ch?.meta.title ?? '' });
                }}
              >
                Umbenennen…
              </button>
              <button
                type="button"
                className="file-tree-context-item file-tree-context-item--danger"
                onClick={() => {
                  setMenu(null);
                  if (window.confirm(`${levelConfig.chapter.label} und alle Inhalte löschen?`)) {
                    void runWithRoot(async () => {
                      await chapterApi.delete(menu.ctx.chapterId, subprojectPath);
                    }).then(() => onStructureMutated());
                  }
                }}
              >
                {levelConfig.chapter.label} löschen
              </button>
            </>
          )}
          {menu.ctx.type === 'scene' && (
            <>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void promptCreate('action', menu.ctx.chapterId, menu.ctx.sceneId)}
              >
                {levelConfig.action.labelNew}
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => {
                  const data = structures.get(menu.ctx.chapterId);
                  const sc = data?.scenes.find((s) => s.id === menu.ctx.sceneId);
                  startRename({
                    kind: 'scene',
                    chapterId: menu.ctx.chapterId,
                    sceneId: menu.ctx.sceneId,
                    currentTitle: sc?.meta.title ?? '',
                  });
                }}
              >
                Umbenennen…
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void handleMoveScene(menu.ctx.chapterId, menu.ctx.sceneId, 'up')}
              >
                Nach oben
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void handleMoveScene(menu.ctx.chapterId, menu.ctx.sceneId, 'down')}
              >
                Nach unten
              </button>
              <button
                type="button"
                className="file-tree-context-item file-tree-context-item--danger"
                onClick={() => {
                  setMenu(null);
                  if (window.confirm(`${levelConfig.scene.label} mit allen Inhalten löschen?`)) {
                    void runWithRoot(async () => {
                      await chapterApi.deleteScene(menu.ctx.chapterId, menu.ctx.sceneId, subprojectPath);
                    }).then(() => {
                      void loadStructure(menu.ctx.chapterId);
                      onStructureMutated();
                    });
                  }
                }}
              >
                {levelConfig.scene.label} löschen
              </button>
            </>
          )}
          {menu.ctx.type === 'action' && (
            <>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => {
                  const data = structures.get(menu.ctx.chapterId);
                  const sc = data?.scenes.find((s) => s.id === menu.ctx.sceneId);
                  const ac = sc?.actions.find((a) => a.id === menu.ctx.actionId);
                  startRename({
                    kind: 'action',
                    chapterId: menu.ctx.chapterId,
                    sceneId: menu.ctx.sceneId,
                    actionId: menu.ctx.actionId,
                    currentTitle: ac?.meta.title ?? '',
                  });
                }}
              >
                Umbenennen…
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void handleMoveAction(menu.ctx.chapterId, menu.ctx.sceneId, menu.ctx.actionId, 'up')}
              >
                Nach oben
              </button>
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void handleMoveAction(menu.ctx.chapterId, menu.ctx.sceneId, menu.ctx.actionId, 'down')}
              >
                Nach unten
              </button>
              <button
                type="button"
                className="file-tree-context-item file-tree-context-item--danger"
                onClick={() => {
                  setMenu(null);
                  if (window.confirm(`${levelConfig.action.label} löschen?`)) {
                    void runWithRoot(async () => {
                      await chapterApi.deleteAction(
                        menu.ctx.chapterId,
                        menu.ctx.sceneId,
                        menu.ctx.actionId,
                        subprojectPath,
                      );
                    }).then(() => {
                      void loadStructure(menu.ctx.chapterId);
                      onStructureMutated();
                    });
                  }
                }}
              >
                {levelConfig.action.label} löschen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
