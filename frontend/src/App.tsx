import { useState, useCallback, useEffect, useMemo } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { Outliner } from './components/Outliner.tsx';
import { FileTreeOutliner } from './components/FileTreeOutliner.tsx';
import { MarkdownFileEditor } from './components/MarkdownFileEditor.tsx';
import { SubprojectTypeDialog } from './components/SubprojectTypeDialog.tsx';
import { MetaPanel } from './components/MetaPanel.tsx';
import { ChapterView } from './components/ChapterView.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { PromptPackModal } from './components/PromptPackModal.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { GitCredentialsDialog } from './components/GitCredentialsDialog.tsx';
import { ProjectSettingsModal } from './components/ProjectSettingsModal.tsx';
import { WikiBrowser } from './components/WikiBrowser.tsx';
import { WikiEntryPopup } from './components/WikiEntryPopup.tsx';
import { WikiTypeEditor } from './components/WikiTypeEditor.tsx';
import { WikiTypePickerDialog } from './components/WikiTypePickerDialog.tsx';
import type { CommandAction } from './components/CommandPalette.tsx';
import type { Mode, GitStatus, GitSyncStatus, MetaSelection, MetaNodeType, NodeMeta } from './types.ts';
import { modesApi, gitApi, projectApi, projectConfigApi, bookApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChapter } from './hooks/useChapter.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';
import { useWiki } from './hooks/useWiki.ts';
import { useWorkspaceMode } from './hooks/useWorkspaceMode.ts';
import { useFileEditor } from './hooks/useFileEditor.ts';

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const wiki = useWiki();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');

  const history = useChatHistory(selectedMode);
  const chat = useChat(history.updateMessages);

  const [openSubproject, setOpenSubproject] = useState<{ path: string; type: string; name?: string } | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [subprojectDialog, setSubprojectDialog] = useState<{ path: string; initialType?: string | null } | null>(null);

  // Project root changes: reset subproject and structure root
  useEffect(() => {
    if (!project.projectPath) return;
    chapter.setProjectPath(project.projectPath);
    setOpenSubproject(null);
    chapter.setStructureRoot(null);
    chapter.closeChapter();
    setSelectedMeta(null);
    setMetaExpanded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  // Subproject folder: load chapters under that root
  useEffect(() => {
    if (!project.projectPath) return;
    if (openSubproject) {
      chapter.setStructureRoot(openSubproject.path);
      chapter.refreshChapters().then(() => {
        const stored = chapter.restoreLastPosition(project.projectPath, openSubproject.path);
        if (stored) {
          chapter.openChapter(stored.chapterId, stored.scrollTarget ?? undefined);
        }
      });
    } else {
      chapter.setStructureRoot(null);
      chapter.closeChapter();
      void chapter.refreshChapters();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSubproject?.path, project.projectPath]);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  function resolveDefaultModeId(mds: Mode[], configured: string | undefined): string {
    const id = configured?.trim() ?? '';
    if (id && mds.some((m) => m.id === id)) return id;
    if (mds.some((m) => m.id === 'review')) return 'review';
    if (mds.length > 0) return mds[0].id;
    return 'review';
  }

  const loadModes = useCallback(async () => {
    try {
      const [mds, status] = await Promise.all([modesApi.getAll(), projectConfigApi.status()]);
      setModes(mds);
      const chatModes = mds.filter(m => m.id !== 'prompt-pack');
      let configured: string | undefined;
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
        } catch {
          /* ignore */
        }
      }
      if (configured === 'prompt-pack') configured = undefined;
      setSelectedMode(resolveDefaultModeId(chatModes, configured));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadModes();
  }, [loadModes, project.projectPath]);

  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);

  const handleSelectMeta = useCallback((selection: MetaSelection) => {
    setSelectedMeta(selection);
    setMetaExpanded(false);
  }, []);

  const handleSelectBookMeta = useCallback(async () => {
    const structureRoot = openSubproject?.path;
    const meta = await bookApi.getMeta(structureRoot);
    setSelectedMeta({ type: 'book', chapterId: '', meta });
    setMetaExpanded(false);
  }, [openSubproject?.path]);

  const handleSaveMeta = useCallback(async (
    type: MetaNodeType,
    meta: NodeMeta,
    chapterId: string,
    sceneId?: string,
    actionId?: string,
  ) => {
    if (type === 'book') {
      await bookApi.updateMeta(meta, openSubproject?.path);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'chapter') {
      await chapter.updateChapterMeta(chapterId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'scene' && sceneId) {
      await chapter.updateSceneMeta(chapterId, sceneId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'action' && sceneId && actionId) {
      await chapter.updateActionMeta(chapterId, sceneId, actionId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    }
  }, [chapter, openSubproject?.path]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [promptPackOpen, setPromptPackOpen] = useState(false);
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
      if (e.ctrlKey && e.shiftKey && e.key === ' ') {
        e.preventDefault();
        setWikiOpen((prev) => !prev);
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
    setOpenSubproject(null);
    await project.openProject(path);
    await chapter.refreshChapters();
    loadModes();
  }, [project, chapter, loadModes]);

  const browseAndOpenProject = useCallback(async () => {
    try {
      const r = await projectApi.browse();
      if (r.cancelled || !r.path) return;
      await handleOpenProject(r.path);
    } catch (e) {
      console.error(e);
    }
  }, [handleOpenProject]);

  const workspaceModeId = openSubproject?.type ?? 'default';
  const {
    schema: workspaceModeSchema,
    metaSchemas: workspaceMetaSchemas,
    levelConfig: workspaceLevelConfig,
    refresh: refreshWorkspaceModeSchema,
  } = useWorkspaceMode(project.projectPath ?? '', workspaceModeId);

  const editorMode = openSubproject ? (workspaceModeSchema?.editorMode ?? 'prose') : 'standard';

  const fileEditor = useFileEditor(project.projectPath ?? null);

  useEffect(() => {
    if (editorMode === 'standard') {
      setSelectedMeta(null);
      setMetaExpanded(false);
    }
  }, [editorMode]);

  useEffect(() => {
    if (openSubproject) {
      setSelectedMeta(null);
      setMetaExpanded(false);
    }
  }, [openSubproject?.path]);

  const onProjectGeneralSaved = useCallback(() => {
    loadModes();
    void refreshWorkspaceModeSchema();
  }, [loadModes, refreshWorkspaceModeSchema]);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      // TODO: reconnect to chapter structure — pass active chapter/scene/action metadata as context
      // Currently sending null as activeFile; replace with chapter context when ContextService is updated
      chat.sendMessage(message, null, selectedMode, refs.referencedFiles, mode?.name, mode?.color);
    },
    [chat, selectedMode, modes, refs.referencedFiles],
  );

  const modesForChat = useMemo(() => modes.filter(m => m.id !== 'prompt-pack'), [modes]);

  const handlePromptPackGenerate = useCallback(
    (message: string, files: string[]) => {
      const m = modes.find(x => x.id === 'prompt-pack');
      chat.sendMessage(
        message,
        null,
        'prompt-pack',
        files,
        m?.name ?? 'Prompt-Paket',
        m?.color ?? '#f9e2af',
      );
      setPromptPackOpen(false);
    },
    [chat, modes],
  );

  useEffect(() => {
    if (!modes.length) return;
    if (selectedMode === 'prompt-pack') {
      const chatModes = modes.filter(x => x.id !== 'prompt-pack');
      setSelectedMode(resolveDefaultModeId(chatModes, undefined));
    }
  }, [modes, selectedMode]);

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
        onOpenFolder={browseAndOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus ?? undefined}
        onAuthRequired={showCredentialsDialog}
      />

      <Group orientation="horizontal" className="app-panels">
        <Panel defaultSize="18%" minSize="10%" maxSize="50%">
          <div className="left-column">
            <div className="workspace-toolbar">
              <button type="button" onClick={() => { void browseAndOpenProject(); }} title="Projekt-Ordner öffnen">
                <FolderOpen size={16} />
                <span>Ordner</span>
              </button>
              {openSubproject && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenSubproject(null);
                    setSelectedMeta(null);
                    setMetaExpanded(false);
                  }}
                  title="Zurück zum Datei-Browser"
                >
                  Dateien
                </button>
              )}
            </div>
            <div className={`outliner-slot${selectedMeta && editorMode !== 'standard' ? ' split' : ''}`}>
              {editorMode === 'standard' ? (
                <FileTreeOutliner
                  projectPath={project.projectPath ?? null}
                  selectedPath={fileEditor.selectedPath}
                  onSelectFile={fileEditor.openFile}
                  onRevealInExplorer={() => projectApi.reveal().catch(console.error)}
                  refreshNonce={treeRefreshKey}
                  onSubprojectOpen={(path, type) => {
                    setOpenSubproject({ path, type });
                    setSelectedMeta(null);
                    setMetaExpanded(false);
                  }}
                  onConfigureSubproject={(path, existingType) => {
                    setSubprojectDialog({ path, initialType: existingType ?? undefined });
                  }}
                />
              ) : (
                <Outliner
                  levelConfig={workspaceLevelConfig}
                  chapters={chapter.chapters}
                  activeChapter={chapter.activeChapter}
                  editorPosition={chapter.editorPosition}
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
                  onSelectMeta={handleSelectMeta}
                  onSelectBookMeta={handleSelectBookMeta}
                />
              )}
            </div>

            {selectedMeta && editorMode !== 'standard' && (
              <div className="meta-panel-slot">
                <MetaPanel
                  selection={selectedMeta}
                  metaSchemas={workspaceMetaSchemas}
                  onSave={handleSaveMeta}
                  onClose={() => { setSelectedMeta(null); setMetaExpanded(false); }}
                  onExpand={() => setMetaExpanded(true)}
                />
              </div>
            )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="45%" minSize="15%">
          {metaExpanded && selectedMeta && editorMode !== 'standard' ? (
            <div className="meta-panel-center">
              <MetaPanel
                selection={selectedMeta}
                metaSchemas={workspaceMetaSchemas}
                onSave={handleSaveMeta}
                onClose={() => setMetaExpanded(false)}
                expanded={true}
              />
            </div>
          ) : editorMode === 'standard' ? (
            <MarkdownFileEditor
              path={fileEditor.selectedPath}
              content={fileEditor.content}
              dirty={fileEditor.dirty}
              loading={fileEditor.loading}
              error={fileEditor.error}
              onChange={fileEditor.setContent}
              onSave={() => { void fileEditor.save(); fetchGitState(); }}
              onClearError={fileEditor.clearError}
            />
          ) : editorMode === 'prose' ? (
            chapter.activeChapter ? (
              <ChapterView
                chapter={chapter.activeChapter}
                actionContents={chapter.actionContents}
                scrollTarget={chapter.scrollTarget}
                hasDirtyActions={chapter.hasDirtyActions}
                onActionChange={chapter.updateActionContent}
                onActionSave={chapter.saveAction}
                onSaveAll={() => { chapter.saveAllDirty(); fetchGitState(); }}
                onClose={chapter.closeChapter}
                onScrollTargetConsumed={chapter.clearScrollTarget}
                onEditorFocus={chapter.updateEditorPosition}
              />
            ) : (
              <div className="editor-empty">
                <ChapterPlaceholder />
                <p>Kapitel im Outliner auswählen oder ein neues erstellen</p>
              </div>
            )
          ) : (
            <div className="editor-mode-placeholder editor-empty">
              <p>Kein Editor für diesen Modus</p>
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
            modes={modesForChat}
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
            onOpenPromptPack={() => setPromptPackOpen(true)}
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
          onGeneralConfigSaved={onProjectGeneralSaved}
        />
      )}

      <PromptPackModal
        open={promptPackOpen}
        onClose={() => setPromptPackOpen(false)}
        onGenerate={handlePromptPackGenerate}
        streaming={chat.streaming}
        hasPromptPackMode={modes.some(m => m.id === 'prompt-pack')}
      />

      {wikiOpen && (
        <WikiBrowser
          wiki={wiki}
          onClose={() => setWikiOpen(false)}
        />
      )}

      {wiki.editingEntry && (
        <WikiEntryPopup
          editing={wiki.editingEntry}
          onSave={wiki.saveEntry}
          onClose={wiki.closeEntry}
        />
      )}

      {wiki.editingType && (
        <WikiTypeEditor
          type={wiki.editingType}
          onSave={wiki.saveType}
          onClose={wiki.closeTypeEditor}
        />
      )}

      {wiki.typePickerOpen && (
        <WikiTypePickerDialog
          onConfirm={wiki.createType}
          onClose={wiki.closeTypePicker}
        />
      )}

      {subprojectDialog && (
        <SubprojectTypeDialog
          folderPath={subprojectDialog.path}
          initialTypeId={subprojectDialog.initialType}
          onClose={() => setSubprojectDialog(null)}
          onSaved={() => setTreeRefreshKey((k) => k + 1)}
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
