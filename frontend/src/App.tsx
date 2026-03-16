import { useState, useCallback, useEffect, useMemo } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { Outliner } from './components/Outliner.tsx';
import { ChapterView } from './components/ChapterView.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { GitCredentialsDialog } from './components/GitCredentialsDialog.tsx';
import { ProjectSettingsModal } from './components/ProjectSettingsModal.tsx';
import type { CommandAction } from './components/CommandPalette.tsx';
import type { Mode, GitStatus, GitSyncStatus } from './types.ts';
import { modesApi, gitApi, projectApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChapter } from './hooks/useChapter.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');

  const history = useChatHistory(selectedMode);
  const chat = useChat(history.updateMessages);

  // Load chapter list when project opens
  useEffect(() => {
    if (project.projectPath) {
      chapter.refreshChapters();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
    await chapter.refreshChapters();
    loadModes();
  }, [project, chapter, loadModes]);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      // TODO: reconnect to chapter structure — pass active chapter/scene/action metadata as context
      // Currently sending null as activeFile; replace with chapter context when ContextService is updated
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

  const activeChapterTitle = chapter.activeChapter?.meta.title ?? null;

  return (
    <div className="app">
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
          <Outliner
            chapters={chapter.chapters}
            activeChapter={chapter.activeChapter}
            scrollTarget={chapter.scrollTarget}
            onOpenChapter={chapter.openChapter}
            onScrollTo={chapter.scrollTo}
            onRevealInExplorer={() => projectApi.reveal().catch(console.error)}
            onCreateChapter={chapter.createChapter}
            onDeleteChapter={chapter.deleteChapter}
            onRenameChapter={(id, title) => {
              const current = chapter.chapters.find(c => c.id === id)?.meta;
              if (current) chapter.updateChapterMeta(id, { ...current, title });
            }}
            onCreateScene={chapter.createScene}
            onDeleteScene={chapter.deleteScene}
            onRenameScene={(chapterId, sceneId, title) => {
              const scene = chapter.activeChapter?.scenes.find(s => s.id === sceneId);
              if (scene) chapter.updateSceneMeta(chapterId, sceneId, { ...scene.meta, title });
            }}
            onCreateAction={chapter.createAction}
            onDeleteAction={chapter.deleteAction}
            onRenameAction={(chapterId, sceneId, actionId, title) => {
              const scene = chapter.activeChapter?.scenes.find(s => s.id === sceneId);
              const action = scene?.actions.find(a => a.id === actionId);
              if (action) chapter.updateActionMeta(chapterId, sceneId, actionId, { ...action.meta, title });
            }}
            onReorderScenes={chapter.reorderScenes}
            onReorderActions={chapter.reorderActions}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="45%" minSize="15%">
          {chapter.activeChapter ? (
            <ChapterView
              chapter={chapter.activeChapter}
              actionContents={chapter.actionContents}
              scrollTarget={chapter.scrollTarget}
              hasDirtyActions={chapter.hasDirtyActions}
              onActionChange={chapter.updateActionContent}
              onActionSave={chapter.saveAction}
              onSaveAll={() => { chapter.saveAllDirty(); fetchGitState(); }}
              onScrollTargetConsumed={chapter.clearScrollTarget}
            />
          ) : (
            <div className="editor-empty">
              <ChapterPlaceholder />
              <p>Kapitel im Outliner auswählen oder ein neues erstellen</p>
            </div>
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

      <ContextBar
        contextInfo={chat.contextInfo}
        activeFile={activeChapterTitle}
        isDirty={chapter.hasDirtyActions}
      />

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

function ChapterPlaceholder() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}

export default App;
