import { useState, useEffect, useCallback, useRef, useMemo, type MouseEvent } from 'react';
import { ChevronRight, ChevronDown, Folder, File, FolderOpen } from 'lucide-react';
import { filesApi, subprojectApi, chapterApi } from '../../api.ts';
import { convertWikiOrFlatJsonToMarkdown } from '../../utils/legacyWikiJsonToMarkdown.ts';
import type { FileNode, ChapterSummary, MetaSelection, OutlinerLevelConfig, ScrollTarget, GitStatus } from '../../types.ts';
import { OutlinerIcon } from './outlinerIcons.tsx';
import { SubprojectInlineOutline } from './SubprojectInlineOutline.tsx';
import { resolveLevelConfig } from '../../hooks/useWorkspaceLevelConfigMap.ts';

function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
  if (root.path === targetPath) return root;
  if (!root.children) return null;
  for (const ch of root.children) {
    const f = findNodeByPath(ch, targetPath);
    if (f) return f;
  }
  return null;
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

/** Project-relative path to root meta JSON (e.g. `mybook/.project/book.json`). */
function projectRelativeRootMetaPath(subprojectPath: string, rootMetaRelativePath: string): string {
  const base = subprojectPath.replace(/\/+$/, '');
  if (!base || base === '.') return rootMetaRelativePath;
  return `${base}/${rootMetaRelativePath}`;
}

export interface FileTreeOutlinerProps {
  projectPath: string | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onRevealInExplorer?: () => void;
  refreshNonce?: number;
  onTreeMutated?: () => void;
  onFsChange?: (event: { deleted?: string; renamed?: { from: string; to: string } }) => void;
  /** Book / root meta for this subproject folder */
  onOpenBookMeta?: (subprojectPath: string, subprojectType: string) => void;
  /** Prompt title then create chapter under this subproject */
  onCreateChapterInSubproject?: (subprojectPath: string, subprojectType: string, title: string) => void | Promise<void>;
  onConfigureSubproject?: (path: string, existingType?: string | null) => void;
  activeChapterId?: string | null;
  activeStructureRoot?: string | null;
  editorPosition?: { chapterId: string; sceneId?: string; actionId?: string } | null;
  levelConfigByModeId: Record<string, OutlinerLevelConfig>;
  /** Open chapter editor + meta from inline structure tree */
  onActivateSubprojectStructure?: (
    subprojectPath: string,
    subprojectType: string,
    chapterId: string,
    scroll: ScrollTarget | null,
    selection: MetaSelection,
  ) => void | Promise<void>;
  runSubprojectMutation?: (
    subprojectPath: string,
    subprojectType: string,
    fn: () => Promise<void>,
  ) => Promise<void>;
  onSubprojectStructureChanged?: () => void;
  /** Bump to refetch inline chapter lists under subprojects */
  inlineChaptersRefreshNonce?: number;
  /** If set, tree shows only this folder (subproject) as root */
  scopeToPath?: string | null;
  onClearOutlinerScope?: () => void;
  /** Persist / apply scoped view to this subproject path */
  onSetOutlinerScope?: (relativeSubprojectPath: string) => void;
  /** Called when saved scope no longer exists or is not a subproject */
  onScopeInvalidated?: () => void;
  /** Current git status — used to render change indicators in the tree */
  gitStatus?: GitStatus;
  /** Discard git changes for this file or folder (right-click) */
  onGitRevert?: (path: string, isDirectory: boolean) => void;
  /** Open git file history modal for this file (right-click, files only) */
  onShowFileHistory?: (path: string) => void;
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
  onOpenBookMeta,
  onCreateChapterInSubproject,
  activeChapterId,
  activeStructureRoot,
  editorPosition,
  levelConfigByModeId,
  onActivateSubprojectStructure,
  runSubprojectMutation,
  onSubprojectStructureChanged,
  inlineChaptersRefreshNonce,
  changedPaths,
  dirtyFolders,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: MouseEvent, node: FileNode) => void;
  onOpenBookMeta?: (subprojectPath: string, subprojectType: string) => void;
  onCreateChapterInSubproject?: (subprojectPath: string, subprojectType: string, title: string) => void | Promise<void>;
  activeChapterId?: string | null;
  activeStructureRoot?: string | null;
  editorPosition?: { chapterId: string; sceneId?: string; actionId?: string } | null;
  levelConfigByModeId: Record<string, OutlinerLevelConfig>;
  onActivateSubprojectStructure?: (
    subprojectPath: string,
    subprojectType: string,
    chapterId: string,
    scroll: ScrollTarget | null,
    selection: MetaSelection,
  ) => void | Promise<void>;
  runSubprojectMutation?: (subprojectPath: string, subprojectType: string, fn: () => Promise<void>) => Promise<void>;
  onSubprojectStructureChanged?: () => void;
  inlineChaptersRefreshNonce: number;
  changedPaths: Set<string>;
  dirtyFolders: Set<string>;
}) {
  const isDir = node.directory;
  const isOpen = expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const isSubproject = Boolean(isDir && node.subprojectType);
  const hasGitChange = isDir ? dirtyFolders.has(node.path) : changedPaths.has(node.path);

  const [subChapters, setSubChapters] = useState<ChapterSummary[] | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [rawFilesOpen, setRawFilesOpen] = useState(false);

  const subLevelConfig = resolveLevelConfig(levelConfigByModeId, node.subprojectType);

  useEffect(() => {
    if (!isSubproject || !isOpen || !node.subprojectType) return;
    let cancelled = false;
    setSubLoading(true);
    chapterApi
      .list(node.path)
      .then((list) => {
        if (!cancelled) {
          setSubChapters(list);
          setSubLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubChapters([]);
          setSubLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSubproject, isOpen, node.path, node.subprojectType, inlineChaptersRefreshNonce]);

  const handleClick = () => {
    if (isDir) {
      toggle(node.path);
      return;
    }
    onSelectFile(node.path);
  };

  const spType = node.subprojectType ?? '';
  /** Files and normal folders → chat; Medien-Projekt-Ordner nicht */
  const canDragToChat = !isDir || !isSubproject;
  const dragPayload =
    !canDragToChat ? '' : isDir ? `${node.path.replace(/\/+$/, '')}/` : node.path;

  const rowClass =
    `file-tree-row${isSelected ? ' file-tree-row--active' : ''}${isSubproject ? ' file-tree-row--subproject' : ''}${canDragToChat ? ' file-tree-row--draggable' : ''}`;
  const rowPad = { paddingLeft: 8 + depth * 14 };
  /** Nested <button> breaks drag + is invalid HTML; meta handle is a sibling row. */
  const splitSubprojectMeta = isSubproject && onOpenBookMeta;

  const rootMetaDragPath = projectRelativeRootMetaPath(node.path, subLevelConfig.rootMetaRelativePath);

  return (
    <>
      {splitSubprojectMeta ? (
        <div className="file-tree-subproject-row-wrap">
          <button
            type="button"
            className={`${rowClass} file-tree-subproject-row-main`}
            style={rowPad}
            onClick={handleClick}
            onContextMenu={(e) => onContextMenu(e, node)}
          >
            <span className="file-tree-chevron">
              {isDir ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="file-tree-chevron-spacer" />}
            </span>
            <OutlinerIcon
              name={subLevelConfig.folderIcon}
              size={14}
              className="file-tree-icon file-tree-icon--subproject"
            />
            <span className="file-tree-name">{node.name}</span>
            {hasGitChange && <span className="tree-node-git-dot" title="Enthält ungespeicherte Änderungen" />}
            <span className="file-tree-subproject-badge" title="Medien-Projekt">●</span>
          </button>
          <button
            type="button"
            className="file-tree-subproject-meta-btn outliner-reveal-btn file-tree-row--draggable"
            title={`${subLevelConfig.rootMetaLabel} — in Chat ablegen (ziehen)`}
            onClick={() => onOpenBookMeta(node.path, spType)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', rootMetaDragPath);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <OutlinerIcon name={subLevelConfig.rootMetaIcon} size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={rowClass}
          style={rowPad}
          onClick={handleClick}
          onContextMenu={(e) => onContextMenu(e, node)}
          draggable={canDragToChat}
          onDragStart={
            canDragToChat
              ? (e) => {
                  e.dataTransfer.setData('text/plain', dragPayload);
                  e.dataTransfer.effectAllowed = 'copy';
                }
              : undefined
          }
        >
          <span className="file-tree-chevron">
            {isDir ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="file-tree-chevron-spacer" />}
          </span>
          {isDir ? (
            isSubproject ? (
              <OutlinerIcon
                name={subLevelConfig.folderIcon}
                size={14}
                className="file-tree-icon file-tree-icon--subproject"
              />
            ) : (
              <Folder size={14} className="file-tree-icon" />
            )
          ) : (
            <File size={14} className="file-tree-icon" />
          )}
          <span className="file-tree-name">{node.name}</span>
          {hasGitChange && <span className="tree-node-git-dot" title={isDir ? 'Ordner enthält Änderungen' : 'Datei geändert'} />}
          {isSubproject && <span className="file-tree-subproject-badge" title="Medien-Projekt">●</span>}
        </button>
      )}
      {isDir && isOpen && !isSubproject && node.children?.map((ch) => (
        <TreeNodeRow
          key={ch.path}
          node={ch}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onContextMenu={onContextMenu}
          onOpenBookMeta={onOpenBookMeta}
          onCreateChapterInSubproject={onCreateChapterInSubproject}
          activeChapterId={activeChapterId}
          activeStructureRoot={activeStructureRoot}
          editorPosition={editorPosition}
          levelConfigByModeId={levelConfigByModeId}
          onActivateSubprojectStructure={onActivateSubprojectStructure}
          runSubprojectMutation={runSubprojectMutation}
          onSubprojectStructureChanged={onSubprojectStructureChanged}
          inlineChaptersRefreshNonce={inlineChaptersRefreshNonce}
          changedPaths={changedPaths}
          dirtyFolders={dirtyFolders}
        />
      ))}
      {isSubproject && isOpen && onActivateSubprojectStructure && runSubprojectMutation && onSubprojectStructureChanged && (
        <>
          <SubprojectInlineOutline
            subprojectPath={node.path}
            subprojectType={spType}
            levelConfig={subLevelConfig}
            baseDepth={depth}
            chapterSummaries={subChapters}
            summariesLoading={subLoading}
            activeChapterId={activeChapterId ?? null}
            activeStructureRoot={activeStructureRoot ?? null}
            editorPosition={editorPosition ?? null}
            onStructureMutated={onSubprojectStructureChanged}
            onActivateNode={(chapterId, scroll, selection) => {
              void onActivateSubprojectStructure(node.path, spType, chapterId, scroll, selection);
            }}
            runWithRoot={(fn) => runSubprojectMutation(node.path, spType, fn)}
          />
          {node.children && node.children.length > 0 && (
            <>
              <button
                type="button"
                className={`file-tree-row file-tree-raw-files-toggle${rawFilesOpen ? ' file-tree-row--active' : ''}`}
                style={{ paddingLeft: 8 + (depth + 1) * 14 }}
                onClick={() => setRawFilesOpen((o) => !o)}
              >
                <span className="file-tree-chevron">
                  {rawFilesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <Folder size={14} className="file-tree-icon" />
                <span className="file-tree-name">Ordner-Dateien ({node.children.length})</span>
              </button>
              {rawFilesOpen &&
                node.children.map((ch) => (
                  <TreeNodeRow
                    key={ch.path}
                    node={ch}
                    depth={depth + 2}
                    expanded={expanded}
                    toggle={toggle}
                    selectedPath={selectedPath}
                    onSelectFile={onSelectFile}
                    onContextMenu={onContextMenu}
                    onOpenBookMeta={onOpenBookMeta}
                    onCreateChapterInSubproject={onCreateChapterInSubproject}
                    activeChapterId={activeChapterId}
                    activeStructureRoot={activeStructureRoot}
                    editorPosition={editorPosition}
                    levelConfigByModeId={levelConfigByModeId}
                    onActivateSubprojectStructure={onActivateSubprojectStructure}
                    runSubprojectMutation={runSubprojectMutation}
                    onSubprojectStructureChanged={onSubprojectStructureChanged}
                    inlineChaptersRefreshNonce={inlineChaptersRefreshNonce}
                    changedPaths={changedPaths}
                    dirtyFolders={dirtyFolders}
                  />
                ))}
            </>
          )}
        </>
      )}
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
  onOpenBookMeta,
  onCreateChapterInSubproject,
  onConfigureSubproject,
  activeChapterId,
  activeStructureRoot,
  editorPosition = null,
  levelConfigByModeId,
  onActivateSubprojectStructure,
  runSubprojectMutation,
  onSubprojectStructureChanged,
  inlineChaptersRefreshNonce = 0,
  scopeToPath = null,
  onClearOutlinerScope,
  onSetOutlinerScope,
  onScopeInvalidated,
  gitStatus,
  onGitRevert,
  onShowFileHistory,
}: FileTreeOutlinerProps) {
  const [root, setRoot] = useState<FileNode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['.']));
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Build the set of all changed file paths and the set of all folders that contain changes.
  const changedPaths = useMemo<Set<string>>(() => {
    if (!gitStatus?.isRepo) return new Set();
    const all = [
      ...(gitStatus.modified  ?? []),
      ...(gitStatus.added     ?? []),
      ...(gitStatus.changed   ?? []),
      ...(gitStatus.untracked ?? []),
      ...(gitStatus.missing   ?? []),
      ...(gitStatus.removed   ?? []),
    ];
    return new Set(all.map((p) => p.replace(/\/$/, '')));
  }, [gitStatus]);

  const dirtyFolders = useMemo<Set<string>>(() => {
    const folders = new Set<string>();
    if (changedPaths.size === 0) return folders;
    folders.add('.');
    for (const filePath of changedPaths) {
      const parts = filePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    }
    return folders;
  }, [changedPaths]);

  const scopedNode = useMemo(() => {
    if (!root || !scopeToPath) return null;
    return findNodeByPath(root, scopeToPath);
  }, [root, scopeToPath]);

  const displayRoot = scopedNode ?? root;

  const effectiveTreeRootPath = scopeToPath ?? '.';

  useEffect(() => {
    if (!root || !scopeToPath) return;
    if (!scopedNode || !scopedNode.directory || !scopedNode.subprojectType) {
      onScopeInvalidated?.();
    }
  }, [root, scopeToPath, scopedNode, onScopeInvalidated]);

  useEffect(() => {
    if (!root) return;
    if (scopeToPath && findNodeByPath(root, scopeToPath)) {
      setExpanded(new Set([scopeToPath]));
    } else if (!scopeToPath) {
      setExpanded(new Set(['.']));
    }
  }, [scopeToPath, root]);

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
          const expandKey =
            scopeToPath && findNodeByPath(tree, scopeToPath) ? scopeToPath : '.';
          setExpanded(new Set([expandKey]));
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Baum konnte nicht geladen werden');
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, refreshNonce, scopeToPath]);

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

  const handleRandomizeIds = async (path: string) => {
    if (!window.confirm('Alle Dateinamen (Kapitel, Szenen, Handlungseinheiten) in diesem Projekt auf zufällige UUIDs umbenennen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.')) return;
    try {
      const result = await chapterApi.randomizeIds(path);
      setMenu(null);
      refreshAfterMutation();
      window.alert(`${result.renamed} Dateien erfolgreich umbenannt.`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Umbenennung fehlgeschlagen');
    }
  };

  const handleConvertJsonToMarkdown = useCallback(
    async (jsonPath: string) => {
      setMenu(null);
      try {
        const { content } = await filesApi.getContent(jsonPath);
        const result = convertWikiOrFlatJsonToMarkdown(content);
        if (!result) {
          window.alert(
            'Die Datei ist kein erkanntes Wiki-JSON.\n\nErwartet wird z. B. { "id", "typeId", "values": { … } } oder ein flaches JSON-Objekt mit String-Feldern.',
          );
          return;
        }
        const outPath = jsonPath.replace(/\.json$/i, '.md');
        if (outPath === jsonPath) {
          window.alert('Nur Dateien mit der Endung .json können konvertiert werden.');
          return;
        }
        try {
          await filesApi.getContent(outPath);
          if (
            !window.confirm(
              `Die Datei „${outPath}“ existiert bereits.\n\nÜberschreiben?`,
            )
          ) {
            return;
          }
        } catch {
          /* target does not exist */
        }
        await filesApi.saveContent(outPath, result.markdown);
        refreshAfterMutation();
        onSelectFile(outPath);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Konvertierung fehlgeschlagen');
      }
    },
    [onSelectFile, refreshAfterMutation],
  );

  const handleNewChapterInSubproject = (path: string, type: string) => {
    const { chapter } = resolveLevelConfig(levelConfigByModeId, type);
    const title = window.prompt(`Titel (${chapter.label}):`, chapter.labelNew);
    if (!title?.trim()) return;
    void onCreateChapterInSubproject?.(path, type, title.trim());
    setMenu(null);
  };

  const showCreate = menu?.directory === true;
  const showRenameDelete = menu != null && menu.path !== effectiveTreeRootPath;
  const showSubproject =
    menu?.directory === true && Boolean(menu.subprojectType || onConfigureSubproject);
  const showSepBeforeSubproject = Boolean(menu && showSubproject && (showCreate || showRenameDelete));

  return (
    <div className="file-tree-outliner outliner">
      <div className="outliner-header">
        <span className="outliner-header-title">Workspace</span>
        {onRevealInExplorer && (
          <button type="button" className="outliner-reveal-btn" onClick={onRevealInExplorer} title="Im Explorer öffnen">
            <FolderOpen size={13} />
          </button>
        )}
      </div>
      {scopeToPath && scopedNode && onClearOutlinerScope && (
        <div className="file-tree-scope-banner">
          <span className="file-tree-scope-banner-label" title={scopeToPath}>
            Nur: {scopedNode.name}
          </span>
          <button type="button" className="file-tree-scope-banner-clear" onClick={onClearOutlinerScope}>
            Gesamtes Projekt
          </button>
        </div>
      )}
      <div className="file-tree-scroll outliner-content">
        {loadError && <div className="file-tree-error">{loadError}</div>}
        {!root && !loadError && projectPath && <div className="file-tree-loading">Laden…</div>}
        {displayRoot && (
          <TreeNodeRow
            node={displayRoot}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onContextMenu={onContextMenu}
            onOpenBookMeta={onOpenBookMeta}
            onCreateChapterInSubproject={onCreateChapterInSubproject}
            activeChapterId={activeChapterId}
            activeStructureRoot={activeStructureRoot}
            editorPosition={editorPosition}
            levelConfigByModeId={levelConfigByModeId}
            onActivateSubprojectStructure={onActivateSubprojectStructure}
            runSubprojectMutation={runSubprojectMutation}
            onSubprojectStructureChanged={onSubprojectStructureChanged}
            inlineChaptersRefreshNonce={inlineChaptersRefreshNonce}
            changedPaths={changedPaths}
            dirtyFolders={dirtyFolders}
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
          {!menu.directory &&
            ((onShowFileHistory && gitStatus?.isRepo) || menu.path.toLowerCase().endsWith('.json')) && (
              <div className="file-tree-context-separator" role="separator" />
            )}
          {!menu.directory && onShowFileHistory && gitStatus?.isRepo && (
            <button
              type="button"
              className="file-tree-context-item"
              onClick={() => {
                onShowFileHistory(menu.path);
                setMenu(null);
              }}
            >
              Verlauf anzeigen
            </button>
          )}
          {!menu.directory && menu.path.toLowerCase().endsWith('.json') && (
            <button
              type="button"
              className="file-tree-context-item"
              onClick={() => void handleConvertJsonToMarkdown(menu.path)}
            >
              Nach Markdown konvertieren…
            </button>
          )}
          {onGitRevert &&
            (menu.directory ? dirtyFolders.has(menu.path) : changedPaths.has(menu.path)) && (
              <>
                <div className="file-tree-context-separator" role="separator" />
                <button
                  type="button"
                  className="file-tree-context-item file-tree-context-item--danger"
                  onClick={() => {
                    onGitRevert(menu.path, menu.directory);
                    setMenu(null);
                  }}
                >
                  Änderungen verwerfen…
                </button>
              </>
            )}
          {showSepBeforeSubproject && <div className="file-tree-context-separator" role="separator" />}
          {menu.directory && menu.subprojectType ? (
            <>
              {onSetOutlinerScope && scopeToPath !== menu.path && (
                <button
                  type="button"
                  className="file-tree-context-item"
                  onClick={() => {
                    onSetOutlinerScope(menu.path);
                    setMenu(null);
                  }}
                >
                  Ansicht hierdrauf beschränken
                </button>
              )}
              {onOpenBookMeta && (
                <button
                  type="button"
                  className="file-tree-context-item"
                  onClick={() => {
                    onOpenBookMeta(menu.path, menu.subprojectType!);
                    setMenu(null);
                  }}
                >
                  Root-Metadaten…
                </button>
              )}
              <button
                type="button"
                className="file-tree-context-item"
                onClick={() => void handleRandomizeIds(menu.path)}
              >
                Dateinamen randomisieren…
              </button>
              {onCreateChapterInSubproject && (
                <button
                  type="button"
                  className="file-tree-context-item"
                  onClick={() => handleNewChapterInSubproject(menu.path, menu.subprojectType!)}
                >
                  {resolveLevelConfig(levelConfigByModeId, menu.subprojectType).chapter.labelNew}…
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
