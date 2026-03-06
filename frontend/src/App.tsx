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
import type { CommandAction } from './components/CommandPalette.tsx';
import type { Mode, GitStatus, GitSyncStatus } from './types.ts';
import { modesApi, gitApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';

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

  useEffect(() => {
    loadModes();
  }, [loadModes]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; isDirectory: boolean } | null>(null);
  const [historyFile, setHistoryFile] = useState<string | null>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  const hasUncommitted = !gitStatus?.isClean;

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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
  }, [project, loadModes]);

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
          <FileTree
            tree={project.fileTree}
            activeFile={project.openFilePath}
            onFileClick={project.openFile}
            onFileDragStart={handleFileDragStart}
            changedPaths={changedPaths}
            onFileContextMenu={handleFileContextMenu}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="45%" minSize="15%">
          <Editor
            content={project.fileContent}
            filePath={project.openFilePath}
            isDirty={project.isDirty}
            onChange={project.updateContent}
            onSave={async () => { await project.saveFile(); fetchGitState(); }}
          />
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
            </>
          ) : (
            <>
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
          onClose={() => setSettingsOpen(false)}
          onModesChanged={loadModes}
        />
      )}
    </div>
  );
}

export default App;
