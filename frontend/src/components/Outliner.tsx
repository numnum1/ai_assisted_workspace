import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, BookOpen, Layers, AlignLeft, FolderOpen } from 'lucide-react';
import type { ChapterSummary, ChapterNode, ScrollTarget } from '../types.ts';

interface OutlinerProps {
  chapters: ChapterSummary[];
  activeChapter: ChapterNode | null;
  scrollTarget: ScrollTarget | null;
  onOpenChapter: (id: string) => void;
  onScrollTo: (target: ScrollTarget) => void;
  onCreateChapter: (title: string) => void;
  onDeleteChapter: (id: string) => void;
  onRenameChapter: (id: string, title: string) => void;
  onCreateScene: (chapterId: string, title: string) => void;
  onDeleteScene: (chapterId: string, sceneId: string) => void;
  onRenameScene: (chapterId: string, sceneId: string, title: string) => void;
  onCreateAction: (chapterId: string, sceneId: string, title: string) => void;
  onDeleteAction: (chapterId: string, sceneId: string, actionId: string) => void;
  onRenameAction: (chapterId: string, sceneId: string, actionId: string, title: string) => void;
  onReorderScenes: (chapterId: string, orderedIds: string[]) => void;
  onReorderActions: (chapterId: string, sceneId: string, orderedIds: string[]) => void;
}

type ContextMenuState = {
  x: number;
  y: number;
  type: 'root' | 'chapter' | 'scene' | 'action';
  chapterId?: string;
  sceneId?: string;
  actionId?: string;
} | null;

type RenameState = {
  type: 'chapter' | 'scene' | 'action';
  chapterId?: string;
  sceneId?: string;
  actionId?: string;
  currentTitle: string;
} | null;

export function Outliner({
  chapters,
  activeChapter,
  scrollTarget,
  onOpenChapter,
  onScrollTo,
  onCreateChapter,
  onDeleteChapter,
  onRenameChapter,
  onCreateScene,
  onDeleteScene,
  onRenameScene,
  onCreateAction,
  onDeleteAction,
  onRenameAction,
  onReorderScenes,
  onReorderActions,
}: OutlinerProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Active node key for highlighting
  const activeSceneId = scrollTarget?.sceneId;
  const activeActionId = scrollTarget?.actionId;

  // Expand chapter when it becomes active
  useEffect(() => {
    if (activeChapter) {
      setExpandedChapters(prev => new Set([...prev, activeChapter.id]));
    }
  }, [activeChapter]);

  // Focus rename input when it opens
  useEffect(() => {
    if (renameState && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameState]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const toggleChapter = useCallback((id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const toggleScene = useCallback((sceneKey: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneKey)) { next.delete(sceneKey); } else { next.add(sceneKey); }
      return next;
    });
  }, []);

  const handleChapterClick = useCallback((id: string) => {
    if (activeChapter?.id !== id) {
      onOpenChapter(id);
    }
    toggleChapter(id);
  }, [activeChapter, onOpenChapter, toggleChapter]);

  const handleSceneClick = useCallback((chapterId: string, sceneId: string) => {
    if (activeChapter?.id !== chapterId) {
      onOpenChapter(chapterId);
    }
    onScrollTo({ sceneId });
    const key = `${chapterId}-${sceneId}`;
    toggleScene(key);
  }, [activeChapter, onOpenChapter, onScrollTo, toggleScene]);

  const handleActionClick = useCallback((chapterId: string, sceneId: string, actionId: string) => {
    if (activeChapter?.id !== chapterId) {
      onOpenChapter(chapterId);
    }
    onScrollTo({ sceneId, actionId });
  }, [activeChapter, onOpenChapter, onScrollTo]);

  const openContextMenu = useCallback((e: React.MouseEvent, state: Omit<NonNullable<ContextMenuState>, 'x' | 'y'>) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ ...state, x: e.clientX, y: e.clientY });
  }, []);

  const startRename = useCallback((state: RenameState) => {
    setContextMenu(null);
    setRenameState(state);
    setRenameValue(state?.currentTitle ?? '');
  }, []);

  const commitRename = useCallback(() => {
    if (!renameState || !renameValue.trim()) {
      setRenameState(null);
      return;
    }
    const title = renameValue.trim();
    const { type, chapterId, sceneId, actionId } = renameState;
    if (type === 'chapter' && chapterId) onRenameChapter(chapterId, title);
    else if (type === 'scene' && chapterId && sceneId) onRenameScene(chapterId, sceneId, title);
    else if (type === 'action' && chapterId && sceneId && actionId) onRenameAction(chapterId, sceneId, actionId, title);
    setRenameState(null);
  }, [renameState, renameValue, onRenameChapter, onRenameScene, onRenameAction]);

  const promptCreate = useCallback((
    type: 'chapter' | 'scene' | 'action',
    chapterId?: string,
    sceneId?: string
  ) => {
    setContextMenu(null);
    const defaultTitle = type === 'chapter' ? 'Neues Kapitel'
      : type === 'scene' ? 'Neue Szene'
      : 'Neue Handlungseinheit';
    const title = window.prompt(`Titel für neue ${type === 'chapter' ? 'Kapitel' : type === 'scene' ? 'Szene' : 'Handlungseinheit'}:`, defaultTitle);
    if (!title?.trim()) return;
    if (type === 'chapter') onCreateChapter(title.trim());
    else if (type === 'scene' && chapterId) onCreateScene(chapterId, title.trim());
    else if (type === 'action' && chapterId && sceneId) onCreateAction(chapterId, sceneId, title.trim());
  }, [onCreateChapter, onCreateScene, onCreateAction]);

  const handleMoveScene = useCallback((chapterId: string, sceneId: string, direction: 'up' | 'down') => {
    if (!activeChapter || activeChapter.id !== chapterId) return;
    const ids = activeChapter.scenes.map(s => s.id);
    const idx = ids.indexOf(sceneId);
    if (direction === 'up' && idx > 0) {
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    } else if (direction === 'down' && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    }
    onReorderScenes(chapterId, ids);
    setContextMenu(null);
  }, [activeChapter, onReorderScenes]);

  const handleMoveAction = useCallback((chapterId: string, sceneId: string, actionId: string, direction: 'up' | 'down') => {
    if (!activeChapter || activeChapter.id !== chapterId) return;
    const scene = activeChapter.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const ids = scene.actions.map(a => a.id);
    const idx = ids.indexOf(actionId);
    if (direction === 'up' && idx > 0) {
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    } else if (direction === 'down' && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    }
    onReorderActions(chapterId, sceneId, ids);
    setContextMenu(null);
  }, [activeChapter, onReorderActions]);

  return (
    <div
      className="outliner"
      onContextMenu={e => openContextMenu(e, { type: 'root' })}
    >
      <div className="outliner-header">
        <FolderOpen size={14} />
        <span>Projekt</span>
      </div>

      <div className="outliner-content">
        {chapters.map(chapter => {
          const isActiveChapter = activeChapter?.id === chapter.id;
          const isExpanded = expandedChapters.has(chapter.id);
          const chapterData = isActiveChapter ? activeChapter : null;

          return (
            <div key={chapter.id}>
              <div
                className={`outliner-node outliner-chapter${isActiveChapter ? ' active' : ''}`}
                onClick={() => handleChapterClick(chapter.id)}
                onContextMenu={e => openContextMenu(e, { type: 'chapter', chapterId: chapter.id })}
                title={chapter.meta.title}
              >
                <span className="outliner-arrow">
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <BookOpen size={13} className="outliner-type-icon" />
                {renameState?.type === 'chapter' && renameState.chapterId === chapter.id ? (
                  <input
                    ref={renameInputRef}
                    className="outliner-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenameState(null);
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="outliner-label">{chapter.meta.title}</span>
                )}
              </div>

              {isExpanded && chapterData && chapterData.scenes.map(scene => {
                const sceneKey = `${chapter.id}-${scene.id}`;
                const isActiveScene = isActiveChapter && activeSceneId === scene.id && !activeActionId;
                const isSceneExpanded = expandedScenes.has(sceneKey);

                return (
                  <div key={scene.id}>
                    <div
                      className={`outliner-node outliner-scene${isActiveScene ? ' active' : ''}`}
                      style={{ paddingLeft: '20px' }}
                      onClick={() => handleSceneClick(chapter.id, scene.id)}
                      onContextMenu={e => openContextMenu(e, { type: 'scene', chapterId: chapter.id, sceneId: scene.id })}
                      title={scene.meta.title}
                    >
                      <span className="outliner-arrow">
                        {isSceneExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                      <Layers size={12} className="outliner-type-icon" />
                      {renameState?.type === 'scene' && renameState.sceneId === scene.id ? (
                        <input
                          ref={renameInputRef}
                          className="outliner-rename-input"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenameState(null);
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="outliner-label">{scene.meta.title}</span>
                      )}
                    </div>

                    {isSceneExpanded && scene.actions.map(action => {
                      const isActiveAction = isActiveChapter && activeActionId === action.id;
                      return (
                        <div
                          key={action.id}
                          className={`outliner-node outliner-action${isActiveAction ? ' active' : ''}`}
                          style={{ paddingLeft: '36px' }}
                          onClick={() => handleActionClick(chapter.id, scene.id, action.id)}
                          onContextMenu={e => openContextMenu(e, { type: 'action', chapterId: chapter.id, sceneId: scene.id, actionId: action.id })}
                          title={action.meta.title}
                        >
                          <span className="outliner-arrow" style={{ width: 13 }} />
                          <AlignLeft size={12} className="outliner-type-icon" />
                          {renameState?.type === 'action' && renameState.actionId === action.id ? (
                            <input
                              ref={renameInputRef}
                              className="outliner-rename-input"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') setRenameState(null);
                              }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span className="outliner-label">{action.meta.title}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="tree-context-menu outliner-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.type === 'root' && (
            <div className="tree-context-menu-item" onClick={() => promptCreate('chapter')}>
              Neues Kapitel
            </div>
          )}
          {contextMenu.type === 'chapter' && contextMenu.chapterId && (
            <>
              <div className="tree-context-menu-item" onClick={() => promptCreate('scene', contextMenu.chapterId)}>
                Neue Szene
              </div>
              <div className="tree-context-menu-item" onClick={() => {
                const chapterMeta = chapters.find(c => c.id === contextMenu.chapterId)?.meta;
                startRename({ type: 'chapter', chapterId: contextMenu.chapterId, currentTitle: chapterMeta?.title ?? '' });
              }}>
                Umbenennen
              </div>
              <div className="tree-context-menu-item tree-context-menu-item-danger" onClick={() => {
                setContextMenu(null);
                if (window.confirm('Kapitel und alle Inhalte löschen?')) {
                  onDeleteChapter(contextMenu.chapterId!);
                }
              }}>
                Kapitel löschen
              </div>
            </>
          )}
          {contextMenu.type === 'scene' && contextMenu.chapterId && contextMenu.sceneId && (
            <>
              <div className="tree-context-menu-item" onClick={() => promptCreate('action', contextMenu.chapterId, contextMenu.sceneId)}>
                Neue Handlungseinheit
              </div>
              <div className="tree-context-menu-item" onClick={() => {
                const scene = activeChapter?.scenes.find(s => s.id === contextMenu.sceneId);
                startRename({ type: 'scene', chapterId: contextMenu.chapterId, sceneId: contextMenu.sceneId, currentTitle: scene?.meta.title ?? '' });
              }}>
                Umbenennen
              </div>
              <div className="tree-context-menu-item" onClick={() => handleMoveScene(contextMenu.chapterId!, contextMenu.sceneId!, 'up')}>
                Nach oben
              </div>
              <div className="tree-context-menu-item" onClick={() => handleMoveScene(contextMenu.chapterId!, contextMenu.sceneId!, 'down')}>
                Nach unten
              </div>
              <div className="tree-context-menu-item tree-context-menu-item-danger" onClick={() => {
                setContextMenu(null);
                if (window.confirm('Szene und alle Handlungseinheiten löschen?')) {
                  onDeleteScene(contextMenu.chapterId!, contextMenu.sceneId!);
                }
              }}>
                Szene löschen
              </div>
            </>
          )}
          {contextMenu.type === 'action' && contextMenu.chapterId && contextMenu.sceneId && contextMenu.actionId && (
            <>
              <div className="tree-context-menu-item" onClick={() => {
                const scene = activeChapter?.scenes.find(s => s.id === contextMenu.sceneId);
                const action = scene?.actions.find(a => a.id === contextMenu.actionId);
                startRename({ type: 'action', chapterId: contextMenu.chapterId, sceneId: contextMenu.sceneId, actionId: contextMenu.actionId, currentTitle: action?.meta.title ?? '' });
              }}>
                Umbenennen
              </div>
              <div className="tree-context-menu-item" onClick={() => handleMoveAction(contextMenu.chapterId!, contextMenu.sceneId!, contextMenu.actionId!, 'up')}>
                Nach oben
              </div>
              <div className="tree-context-menu-item" onClick={() => handleMoveAction(contextMenu.chapterId!, contextMenu.sceneId!, contextMenu.actionId!, 'down')}>
                Nach unten
              </div>
              <div className="tree-context-menu-item tree-context-menu-item-danger" onClick={() => {
                setContextMenu(null);
                if (window.confirm('Handlungseinheit löschen?')) {
                  onDeleteAction(contextMenu.chapterId!, contextMenu.sceneId!, contextMenu.actionId!);
                }
              }}>
                Handlungseinheit löschen
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
