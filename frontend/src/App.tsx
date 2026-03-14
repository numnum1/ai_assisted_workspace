import { useState, useCallback, useEffect, useMemo } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { FileTree } from './components/FileTree.tsx';
import { Editor } from './components/Editor.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { FileHistoryModal } from './components/FileHistoryModal.tsx';
import { GitCredentialsDialog } from './components/GitCredentialsDialog.tsx';
import { ProjectSettingsModal } from './components/ProjectSettingsModal.tsx';
import { ContentBrowser } from './components/ContentBrowser.tsx';
import { MetafileEditor } from './components/MetafileEditor.tsx';
import { MetafileTypeDialog } from './components/MetafileTypeDialog.tsx';
import { PlanningPanel } from './components/PlanningPanel.tsx';
import type { MetafileType } from './components/MetafileTypeDialog.tsx';
import type { CommandAction } from './components/CommandPalette.tsx';
import type { Mode, GitStatus, GitSyncStatus } from './types.ts';
import { modesApi, gitApi, projectConfigApi, filesApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';
import { getBookmark } from './components/bookmarkExtension';

function App() {
  const project = useProject();
  const refs = useReferencedFiles();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');

  const history = useChatHistory(selectedMode);
  const chat = useChat(history.updateMessages);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // Only react to activeId changes, not the conversation object itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  const loadModes = useCallback(() => {
    modesApi.getAll().then(setModes).catch(console.error);
  }, []);

  const loadFeatures = useCallback(() => {
    projectConfigApi.get().then(cfg => setFeatures(cfg.features ?? [])).catch(() => setFeatures([]));
  }, []);

  useEffect(() => {
    loadModes();
    loadFeatures();
  }, [loadModes, loadFeatures]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; isDirectory: boolean } | null>(null);
  const [historyFile, setHistoryFile] = useState<string | null>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [bookmarkRefresh, setBookmarkRefresh] = useState(0);
  const [bookmarkJumpTarget, setBookmarkJumpTarget] = useState<{ filePath: string; line: number } | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [pendingMetafilePath, setPendingMetafilePath] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'files' | 'planning'>('files');
  const [planningRefresh, setPlanningRefresh] = useState(0);

  const hasUncommitted = !gitStatus?.isClean;

  const bookmark = project.projectPath ? getBookmark(project.projectPath) : null;

  const handleJumpToBookmark = useCallback(() => {
    if (!bookmark) return;
    project.openFile(bookmark.filePath);
    setBookmarkJumpTarget(bookmark);
  }, [bookmark, project]);

  const handleBookmarkJumpDone = useCallback(() => {
    setBookmarkJumpTarget(null);
  }, []);

  const handleBookmarkChange = useCallback(() => {
    setBookmarkRefresh((r) => r + 1);
  }, []);

  const showCredentialsDialog = useCallback((retry: () => void) => {
    setPendingRetry(() => retry);
    setCredDialogOpen(true);
  }, []);

  const fetchGitState = useCallback(async () => {
    try {
      const [ahead, status] = await Promise.all([
        gitApi.aheadBehind(),
        gitApi.status(),
      ]);
      setSyncStatus(ahead);
      setGitStatus(status);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        showCredentialsDialog(fetchGitState);
      }
      // silently ignore other errors (no repo, no remote)
    }
  }, [showCredentialsDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchGitState();
    const interval = setInterval(fetchGitState, 30_000);
    return () => clearInterval(interval);
  }, [fetchGitState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        setWikiOpen(false);
      }
      if (e.shiftKey && e.key === ' ' && !e.ctrlKey && !e.altKey) {
        if (features.includes('wiki')) {
          e.preventDefault();
          e.stopPropagation();
          setWikiOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [features]);

  const changedPaths = useMemo(() => new Set([
    ...(gitStatus?.modified ?? []),
    ...(gitStatus?.added ?? []),
    ...(gitStatus?.removed ?? []),
    ...(gitStatus?.untracked ?? []),
    ...(gitStatus?.changed ?? []),
    ...(gitStatus?.missing ?? []),
  ]), [gitStatus]);

  const syncBadge = useMemo(() => {
    if (!syncStatus) return null;
    if (syncStatus.behind > 0)
      return (
        <span className="palette-git-badge behind">
          <ArrowDown size={11} />
          {syncStatus.behind}
        </span>
      );
    if (syncStatus.ahead > 0)
      return (
        <span className="palette-git-badge ahead">
          <ArrowUp size={11} />
          {syncStatus.ahead}
        </span>
      );
    return (
      <span className="palette-git-badge synced">
        <Check size={11} />
      </span>
    );
  }, [syncStatus]);

  const commandActions: CommandAction[] = useMemo(() => [
    {
      id: 'open-folder',
      label: 'Open Folder',
      shortcut: 'Ctrl+Shift+A',
      icon: <FolderOpen size={16} />,
      handler: () => {},
    },
    {
      id: 'project-settings',
      label: 'Project Settings',
      icon: <Settings size={16} />,
      handler: () => { setPaletteOpen(false); setSettingsOpen(true); },
    },
    hasUncommitted
      ? {
          id: 'git-commit',
          label: 'Commit',
          icon: <GitCommitHorizontal size={16} />,
          handler: () => {},
        }
      : {
          id: 'git-sync',
          label: 'Sync',
          icon: <RefreshCw size={16} />,
          badge: syncBadge,
          handler: () => {},
        },
  ], [hasUncommitted, syncBadge]);

  const handleOpenProject = useCallback(async (path: string) => {
    await project.openProject(path);
    loadModes();
    loadFeatures();
  }, [project, loadModes, loadFeatures]);

  const makeMetafileTemplate = (sourcePath: string, type: MetafileType): string => {
    const id = sourcePath.replace(/^.*\//, '').replace(/\.md$/, '');
    const bodies: Record<MetafileType, string> = {
      book: [
        `id: ${id}`,
        `name: ""`,
        `universum: ""`,
        `zeitliche_einordnung: ""`,
        `beschreibung: ""`,
      ].join('\n') + '\n',
      chapter: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
      scene: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
      action: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `ort: ""`,
        `character: ""`,
        `was_passiert: ""`,
        `ziel: ""`,
      ].join('\n') + '\n',
      arc: [
        `id: ${id}`,
        `title: ""`,
        `thema: ""`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
    };
    return `---\ntype: ${type}\n${bodies[type]}---\n`;
  };

  const openOrCreateMetafile = useCallback(async (filePath: string) => {
    const metaPath = `.planning/${filePath}`;
    try {
      await filesApi.getContent(metaPath);
      project.openFile(metaPath);
    } catch {
      setPendingMetafilePath(filePath);
    }
  }, [project]);

  // pendingMetafilePath can be:
  //   (a) a source file path like "chapter-01/scene-01.md"  → creates .planning/<sourcePath>
  //   (b) a full .planning/... path (for standalone metafiles) → creates exactly that path
  const handleMetafileTypeSelected = useCallback(async (type: MetafileType) => {
    if (!pendingMetafilePath) return;
    const isStandalone = pendingMetafilePath.startsWith('.planning/');
    const metaPath = isStandalone ? pendingMetafilePath : `.planning/${pendingMetafilePath}`;
    const idSource = isStandalone ? pendingMetafilePath.split('/').pop()?.replace(/\.md$/, '') ?? '' : pendingMetafilePath;
    setPendingMetafilePath(null);
    try {
      await filesApi.saveContent(metaPath, makeMetafileTemplate(idSource, type));
      project.openFile(metaPath);
      setPlanningRefresh(r => r + 1);
    } catch (err) {
      console.error('Failed to create metafile:', err);
    }
  }, [pendingMetafilePath, project]);

  const VALID_CHILD_TYPES: MetafileType[] = ['chapter', 'scene', 'action'];

  // Called from PlanningPanel: creates a standalone metafile in the given folder.
  // suggestedType is provided when the hierarchy is known (e.g. child of a book → chapter).
  const handleCreateStandaloneMetafile = useCallback((folder: string, suggestedType?: string) => {
    const name = window.prompt('Name des Metafiles (ohne .md):');
    if (!name || !name.trim()) return;
    const safeName = name.trim().replace(/\.md$/, '') + '.md';
    const targetPath = `${folder}/${safeName}`;

    const lower = suggestedType?.toLowerCase();
    const inferredType = lower && VALID_CHILD_TYPES.includes(lower as MetafileType)
      ? (lower as MetafileType)
      : undefined;
    if (inferredType) {
      // Skip the type dialog — hierarchy is fixed
      const idSource = safeName.replace(/\.md$/, '');
      filesApi.saveContent(targetPath, makeMetafileTemplate(idSource, inferredType))
        .then(() => {
          project.openFile(targetPath);
          setPlanningRefresh(r => r + 1);
        })
        .catch(err => console.error('Failed to create metafile:', err));
    } else {
      setPendingMetafilePath(targetPath);
    }
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenMetafile = useCallback(async () => {
    const filePath = project.openFilePath;
    if (!filePath || !features.includes('planning')) return;
    if (filePath.startsWith('.planning/')) {
      project.openFile(filePath.slice('.planning/'.length));
    } else {
      openOrCreateMetafile(filePath);
    }
  }, [project, features, openOrCreateMetafile]);

  const handleDeleteMetafile = useCallback(async (path: string, hasChildren: boolean) => {
    const name = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
    const msg = hasChildren
      ? `"${name}" und alle Untereinträge wirklich löschen?`
      : `"${name}" wirklich löschen?`;
    if (!window.confirm(msg)) return;
    try {
      if (hasChildren) {
        const folderPath = path.replace(/\.md$/, '');
        await project.deleteFile(folderPath);
      }
      await project.deleteFile(path);
      setPlanningRefresh(r => r + 1);
      fetchGitState();
    } catch (err) {
      console.error('Delete metafile failed:', err);
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }, [project]);

  const handleFileDragStart = useCallback((_path: string) => {
    // Visual feedback could be added here
  }, []);

  const handleFileContextMenu = useCallback((path: string, x: number, y: number, isDirectory: boolean) => {
    setContextMenu({ path, x, y, isDirectory });
  }, []);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      chat.sendMessage(message, null, selectedMode, refs.referencedFiles, mode?.name, mode?.color);
    },
    [chat, selectedMode, modes, refs.referencedFiles],
  );

  const handleNewChat = useCallback(() => {
    history.createConversation(selectedMode);
  }, [history, selectedMode]);

  const handleSwitchChat = useCallback((id: string) => {
    history.switchConversation(id);
  }, [history]);

  const handleClearChat = useCallback(() => {
    chat.clearChat();
  }, [chat]);

  const hasWiki = features.includes('wiki');
  const hasPlanning = features.includes('planning');
  const isMetafile = (project.openFilePath?.startsWith('.planning/') ?? false) && hasPlanning;

  return (
    <div className="app" onClick={() => setContextMenu(null)}>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={commandActions}
        onOpenFolder={handleOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus ?? undefined}
        onAuthRequired={showCredentialsDialog}
      />

      <Group direction="horizontal" className="app-panels">
        <Panel defaultSize="18%" minSize="10%" maxSize="50%">
          <div className="left-panel-container">
            {hasPlanning && (
              <div className="left-panel-tabs">
                <button
                  className={`left-panel-tab${leftTab === 'files' ? ' left-panel-tab-active' : ''}`}
                  onClick={() => setLeftTab('files')}
                >Dateien</button>
                <button
                  className={`left-panel-tab${leftTab === 'planning' ? ' left-panel-tab-active' : ''}`}
                  onClick={() => setLeftTab('planning')}
                >Planung</button>
              </div>
            )}
            <div className="left-panel-body">
              {leftTab === 'files' || !hasPlanning ? (
                <FileTree
                  tree={project.fileTree}
                  activeFile={project.openFilePath}
                  bookmark={bookmark}
                  onFileClick={project.openFile}
                  onFileDragStart={handleFileDragStart}
                  onJumpToBookmark={handleJumpToBookmark}
                  changedPaths={changedPaths}
                  onFileContextMenu={handleFileContextMenu}
                />
              ) : (
                <PlanningPanel
                  activeFile={project.openFilePath}
                  onOpenMetafile={project.openFile}
                  onCreateMetafile={handleCreateStandaloneMetafile}
                  onDeleteMetafile={handleDeleteMetafile}
                  refreshTrigger={planningRefresh}
                />
              )}
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="45%" minSize="15%">
          {isMetafile && project.openFilePath ? (
            <MetafileEditor
              content={project.fileContent}
              filePath={project.openFilePath}
              isDirty={project.isDirty}
              onChange={project.updateContent}
              onSave={async () => { await project.saveFile(); fetchGitState(); setPlanningRefresh(r => r + 1); }}
              onOpenSourceFile={handleOpenMetafile}
            />
          ) : (
            <Editor
              content={project.fileContent}
              filePath={project.openFilePath}
              projectPath={project.projectPath}
              bookmarkJumpTarget={bookmarkJumpTarget}
              onBookmarkJumpDone={handleBookmarkJumpDone}
              onBookmarkChange={handleBookmarkChange}
              isDirty={project.isDirty}
              onChange={project.updateContent}
              onSave={async () => { await project.saveFile(); fetchGitState(); }}
              hasPlanning={hasPlanning}
              onOpenMetafile={handleOpenMetafile}
            />
          )}
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="37%" minSize="15%">
          <ChatPanel
            messages={chat.messages}
            streaming={chat.streaming}
            error={chat.error}
            toolActivity={chat.toolActivity}
            modes={modes}
            selectedMode={selectedMode}
            referencedFiles={refs.referencedFiles}
            conversations={history.conversations}
            activeConversationId={history.activeId}
            onModeChange={setSelectedMode}
            onSend={handleSendMessage}
            onStop={chat.stopStreaming}
            onClear={handleClearChat}
            onAddFile={refs.addFile}
            onRemoveFile={refs.removeFile}
            onForkFromMessage={chat.forkFromMessage}
            onNewChat={handleNewChat}
            onSwitchChat={handleSwitchChat}
            onDeleteChat={history.deleteConversation}
            onRenameChat={history.renameConversation}
          />
        </Panel>
      </Group>

      {wikiOpen && hasWiki && (
        <ContentBrowser
          onOpenFile={(path) => { project.openFile(path); setWikiOpen(false); }}
          onClose={() => setWikiOpen(false)}
        />
      )}

      <ContextBar
        contextInfo={chat.contextInfo}
        activeFile={project.openFilePath}
        isDirty={project.isDirty}
      />

      {contextMenu && (
        <div
          className="tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isDirectory ? (
            <>
              <div
                className="tree-context-menu-item"
                onClick={async () => {
                  const path = contextMenu.path;
                  setContextMenu(null);
                  try {
                    await filesApi.openInExplorer(path);
                  } catch (err) {
                    console.error('Open in explorer failed:', err);
                    alert(err instanceof Error ? err.message : 'Ordner konnte nicht geöffnet werden.');
                  }
                }}
              >
                Im Explorer öffnen
              </div>
              <div
                className="tree-context-menu-item"
                onClick={async () => {
                  const parentPath = contextMenu.path;
                  const name = window.prompt('Dateiname:');
                  setContextMenu(null);
                  if (name != null && name.trim() !== '') {
                    try {
                      const newPath = await project.createFile(parentPath, name.trim());
                      project.openFile(newPath);
                      fetchGitState();
                    } catch (err) {
                      console.error('Create file failed:', err);
                      alert(err instanceof Error ? err.message : 'Datei konnte nicht erstellt werden.');
                    }
                  }
                }}
              >
                Neue Datei
              </div>
              <div
                className="tree-context-menu-item"
                onClick={async () => {
                  const parentPath = contextMenu.path;
                  const name = window.prompt('Ordnername:');
                  setContextMenu(null);
                  if (name != null && name.trim() !== '') {
                    try {
                      await project.createFolder(parentPath, name.trim());
                      fetchGitState();
                    } catch (err) {
                      console.error('Create folder failed:', err);
                      alert(err instanceof Error ? err.message : 'Ordner konnte nicht erstellt werden.');
                    }
                  }
                }}
              >
                Neuer Ordner
              </div>
              {contextMenu.path !== '.' && (
                <div
                  className="tree-context-menu-item"
                  onClick={async () => {
                    const path = contextMenu.path;
                    const currentName = path.split('/').pop() ?? path;
                    const newName = window.prompt('Neuer Ordnername:', currentName);
                    setContextMenu(null);
                    if (newName != null && newName.trim() !== '' && newName !== currentName) {
                      try {
                        await project.renamePath(path, newName.trim());
                        fetchGitState();
                      } catch (err) {
                        console.error('Rename failed:', err);
                        alert(err instanceof Error ? err.message : 'Ordner konnte nicht umbenannt werden.');
                      }
                    }
                  }}
                >
                  Umbenennen
                </div>
              )}
              {contextMenu.path !== '.' && (
                <div
                  className="tree-context-menu-item tree-context-menu-item-danger"
                  onClick={async () => {
                    const path = contextMenu.path;
                    setContextMenu(null);
                    if (window.confirm(`Ordner "${path}" und alle Inhalte wirklich löschen?`)) {
                      try {
                        await project.deleteFile(path);
                        fetchGitState();
                      } catch (err) {
                        console.error('Delete failed:', err);
                        alert(err instanceof Error ? err.message : 'Ordner konnte nicht gelöscht werden.');
                      }
                    }
                  }}
                >
                  Löschen
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="tree-context-menu-item"
                onClick={async () => {
                  const path = contextMenu.path;
                  setContextMenu(null);
                  try {
                    await filesApi.openInExplorer(path);
                  } catch (err) {
                    console.error('Open in explorer failed:', err);
                    alert(err instanceof Error ? err.message : 'Ordner konnte nicht im Explorer geöffnet werden.');
                  }
                }}
              >
                Im Explorer öffnen
              </div>
              <div
                className="tree-context-menu-item"
                onClick={() => {
                  setHistoryFile(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                Show History
              </div>
              <div
                className="tree-context-menu-item"
                onClick={async () => {
                  const path = contextMenu.path;
                  const currentName = path.split('/').pop() ?? path;
                  const newName = window.prompt('Neuer Dateiname:', currentName);
                  setContextMenu(null);
                  if (newName != null && newName.trim() !== '' && newName !== currentName) {
                    try {
                      await project.renamePath(path, newName.trim());
                      fetchGitState();
                    } catch (err) {
                      console.error('Rename failed:', err);
                      alert(err instanceof Error ? err.message : 'Datei konnte nicht umbenannt werden.');
                    }
                  }
                }}
              >
                Umbenennen
              </div>
              <div
                className="tree-context-menu-item tree-context-menu-item-danger"
                onClick={async () => {
                  const path = contextMenu.path;
                  setContextMenu(null);
                  if (window.confirm(`Datei "${path}" wirklich löschen?`)) {
                    try {
                      await project.deleteFile(path);
                      fetchGitState();
                    } catch (err) {
                      console.error('Delete failed:', err);
                      alert(err instanceof Error ? err.message : 'Datei konnte nicht gelöscht werden.');
                    }
                  }
                }}
              >
                Löschen
              </div>
            </>
          )}
        </div>
      )}

      {historyFile && (
        <FileHistoryModal
          filePath={historyFile}
          onClose={() => setHistoryFile(null)}
        />
      )}

      {credDialogOpen && (
        <GitCredentialsDialog
          onSuccess={() => {
            setCredDialogOpen(false);
            pendingRetry?.();
            setPendingRetry(null);
          }}
          onCancel={() => {
            setCredDialogOpen(false);
            setPendingRetry(null);
          }}
        />
      )}

      {settingsOpen && (
        <ProjectSettingsModal
          onClose={() => { setSettingsOpen(false); loadFeatures(); }}
          onModesChanged={loadModes}
        />
      )}

      {pendingMetafilePath && (
        <MetafileTypeDialog
          onSelect={handleMetafileTypeSelected}
          onCancel={() => setPendingMetafilePath(null)}
          allowedTypes={
            pendingMetafilePath.startsWith('.planning/') &&
            !pendingMetafilePath.replace(/^\.planning\//, '').includes('/')
              ? ['book', 'arc']
              : undefined
          }
        />
      )}
    </div>
  );
}

export default App;
