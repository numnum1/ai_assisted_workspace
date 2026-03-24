import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react';
import { ChevronRight, ChevronDown, Folder, File, FolderOpen } from 'lucide-react';
import { filesApi, subprojectApi } from '../api.ts';
import type { FileNode } from '../types.ts';
import { OutlinerIcon } from './outlinerIcons.tsx';

function folderIconForSubprojectType(type: string | null | undefined): string {
  if (!type) return 'folder';
  if (type === 'music') return 'disc';
  if (type === 'game') return 'sword';
  if (type === 'book') return 'book';
  return 'book';
}

function normalizeTreeItemName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes('/') || t.includes('\\')) {
    window.alert('Der Name darf keine Pfadtrenner enthalten.');
    return null;
  }
  return t;
}

interface FileTreeOutlinerProps {
  projectPath: string | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onRevealInExplorer?: () => void;
  /** Bump to reload file tree after disk changes */
  refreshNonce?: number;
  /** Called after create / rename / delete so the rest of the app can refresh */
  onTreeMutated?: () => void;
  /** Editor sync when paths change outside the editor */
  onFsChange?: (event: { deleted?: string; renamed?: { from: string; to: string } }) => void;
  onSubprojectOpen?: (path: string, type: string) => void;
  onConfigureSubproject?: (path: string, existingType?: string | null) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  directory: boolean;
  subprojectType: string | null | undefined;
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  toggle,
  selectedPath,
  onSelectFile,
  onContextMenu,
  onSubprojectOpen,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: MouseEvent, node: FileNode) => void;
  onSubprojectOpen?: (path: string, type: string) => void;
}) {
  const isDir = node.directory;
  const isOpen = expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const isSubproject = Boolean(isDir && node.subprojectType);

  const handleClick = () => {
    if (isDir) {
      if (node.subprojectType && onSubprojectOpen) {
        onSubprojectOpen(node.path, node.subprojectType);
        return;
      }
      toggle(node.path);
      return;
    }
    onSelectFile(node.path);
  };

  return (
    <>
      <button
        type="button"
        className={`file-tree-row${isSelected ? ' file-tree-row--active' : ''}${isSubproject ? ' file-tree-row--subproject' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="file-tree-chevron">
          {isDir ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="file-tree-chevron-spacer" />}
        </span>
        {isDir ? (
          isSubproject ? (
            <OutlinerIcon name={folderIconForSubprojectType(node.subprojectType)} size={14} className="file-tree-icon file-tree-icon--subproject" />
          ) : (
            <Folder size={14} className="file-tree-icon" />
          )
        ) : (
          <File size={14} className="file-tree-icon" />
        )}
        <span className="file-tree-name">{node.name}</span>
        {isSubproject && <span className="file-tree-subproject-badge" title="Medien-Projekt">●</span>}
      </button>
      {isDir && isOpen && node.children?.map((ch) => (
        <TreeNodeRow
          key={ch.path}
          node={ch}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onContextMenu={onContextMenu}
          onSubprojectOpen={onSubprojectOpen}
        />
      ))}
    </>
  );
}

export function FileTreeOutliner({
  projectPath,
  selectedPath,
  onSelectFile,
  onRevealInExplorer,
  refreshNonce = 0,
  onTreeMutated,
  onFsChange,
  onSubprojectOpen,
  onConfigureSubproject,
}: FileTreeOutlinerProps) {
  const [root, setRoot] = useState<FileNode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['.']));
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!projectPath) {
      setRoot(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    filesApi
      .getTree()
      .then((tree) => {
        if (!cancelled) {
          setRoot(tree);
          setLoadError(null);
          setExpanded(new Set(['.']));
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Baum konnte nicht geladen werden');
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, refreshNonce]);

  const refreshAfterMutation = useCallback(() => {
    setMenu(null);
    if (onTreeMutated) {
      onTreeMutated();
    } else if (projectPath) {
      void filesApi
        .getTree()
        .then(setRoot)
        .catch((e) => setLoadError(e instanceof Error ? e.message : 'Baum konnte nicht geladen werden'));
    }
  }, [onTreeMutated, projectPath]);

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

  const onContextMenu = useCallback((e: MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      directory: node.directory,
      subprojectType: node.subprojectType,
    });
  }, []);

  const runMutation = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        refreshAfterMutation();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
      }
    },
    [refreshAfterMutation],
  );

  const handleNewFolder = (parentPath: string) => {
    const name = window.prompt('Name des neuen Ordners:');
    const n = name != null ? normalizeTreeItemName(name) : null;
    if (n == null) return;
    void runMutation(async () => {
      await filesApi.createFolder(parentPath, n);
    });
  };

  const handleNewFile = (parentPath: string) => {
    const name = window.prompt('Name der neuen Datei:', 'unbenannt.md');
    const n = name != null ? normalizeTreeItemName(name) : null;
    if (n == null) return;
    void runMutation(async () => {
      await filesApi.createFile(parentPath, n);
    });
  };

  const handleRename = (path: string, isDir: boolean) => {
    const base = path === '.' ? '' : (path.split('/').pop() ?? '');
    const next = window.prompt(isDir ? 'Neuer Ordnername:' : 'Neuer Dateiname:', base);
    const n = next != null ? normalizeTreeItemName(next) : null;
    if (n == null) return;
    void runMutation(async () => {
      const { path: newPath } = await filesApi.rename(path, n);
      onFsChange?.({ renamed: { from: path, to: newPath } });
    });
  };

  const handleDelete = (path: string, isDir: boolean) => {
    const msg = isDir
      ? `Ordner „${path}“ und alle Inhalte wirklich löschen?`
      : `Datei „${path}“ wirklich löschen?`;
    if (!window.confirm(msg)) return;
    void runMutation(async () => {
      await filesApi.deleteContent(path);
      onFsChange?.({ deleted: path });
    });
  };

  const handleRemoveSubproject = async (path: string) => {
    try {
      await subprojectApi.remove(path);
      setMenu(null);
      refreshAfterMutation();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
    }
  };

  const showCreate = menu?.directory === true;
  const showRenameDelete = menu != null && menu.path !== '.';
  const showSubproject =
    menu?.directory === true && Boolean(menu.subprojectType || onConfigureSubproject);
  const showSepBeforeSubproject = Boolean(menu && showSubproject && (showCreate || showRenameDelete));

  return (
    <div className="file-tree-outliner outliner">
      <div className="outliner-header">
        <span className="outliner-header-title">Dateien</span>
        {onRevealInExplorer && (
          <button type="button" className="outliner-reveal-btn" onClick={onRevealInExplorer} title="Im Explorer öffnen">
            <FolderOpen size={13} />
          </button>
        )}
      </div>
      <div className="file-tree-scroll outliner-content">
        {loadError && <div className="file-tree-error">{loadError}</div>}
        {!root && !loadError && projectPath && <div className="file-tree-loading">Laden…</div>}
        {root && (
          <TreeNodeRow
            node={root}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onContextMenu={onContextMenu}
            onSubprojectOpen={onSubprojectOpen}
          />
        )}
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="file-tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          {showCreate && (
            <>
              <button type="button" className="file-tree-context-item" onClick={() => handleNewFolder(menu.path)}>
                Neuer Ordner…
              </button>
              <button type="button" className="file-tree-context-item" onClick={() => handleNewFile(menu.path)}>
                Neue Datei…
              </button>
            </>
          )}
          {showRenameDelete && (
            <>
              <button type="button" className="file-tree-context-item" onClick={() => handleRename(menu.path, menu.directory)}>
                Umbenennen…
              </button>
              <button
                type="button"
                className="file-tree-context-item file-tree-context-item--danger"
                onClick={() => handleDelete(menu.path, menu.directory)}
              >
                Löschen…
              </button>
            </>
          )}
          {showSepBeforeSubproject && <div className="file-tree-context-separator" role="separator" />}
          {menu.directory && menu.subprojectType ? (
            <>
              {onSubprojectOpen && (
                <button
                  type="button"
                  className="file-tree-context-item"
                  onClick={() => {
                    onSubprojectOpen(menu.path, menu.subprojectType!);
                    setMenu(null);
                  }}
                >
                  Medien-Projekt öffnen
                </button>
              )}
              {onConfigureSubproject && (
                <button
                  type="button"
                  className="file-tree-context-item"
                  onClick={() => {
                    onConfigureSubproject(menu.path, menu.subprojectType);
                    setMenu(null);
                  }}
                >
                  Typ ändern…
                </button>
              )}
              <button
                type="button"
                className="file-tree-context-item file-tree-context-item--danger"
                onClick={() => void handleRemoveSubproject(menu.path)}
              >
                Medien-Projekt entfernen
              </button>
            </>
          ) : (
            menu.directory &&
            onConfigureSubproject && (
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => {
                  onConfigureSubproject(menu.path, null);
                  setMenu(null);
                }}
              >
                Als Medien-Projekt einrichten…
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
