import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { FileTreeOutliner } from './components/FileTreeOutliner.tsx';
import { MarkdownFileEditor } from './components/MarkdownFileEditor.tsx';
import { SubprojectTypeDialog } from './components/SubprojectTypeDialog.tsx';
import { MetaPanel } from './components/MetaPanel.tsx';
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
import type { Mode, GitStatus, GitSyncStatus, MetaSelection, MetaNodeType, NodeMeta, SelectionContext } from './types.ts';
import { modesApi, gitApi, projectApi, projectConfigApi, bookApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChapter } from './hooks/useChapter.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';
import { useWiki } from './hooks/useWiki.ts';
import { useWorkspaceMode } from './hooks/useWorkspaceMode.ts';
import { useWorkspaceLevelConfigMap } from './hooks/useWorkspaceLevelConfigMap.ts';
import { useOutlinerScope } from './hooks/useOutlinerScope.ts';
import { useFileEditor } from './hooks/useFileEditor.ts';
import { getMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const wiki = useWiki();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');
  const [useReasoning, setUseReasoning] = useState(false);
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);

  const handleToggleReasoning = useCallback(() => setUseReasoning(v => !v), []);

  const handleModeChange = useCallback((modeId: string, modeList?: typeof modes) => {
    setSelectedMode(modeId);
    const list = modeList ?? modes;
    const m = list.find(x => x.id === modeId);
    setUseReasoning(m?.useReasoning ?? false);
    setModeLlmId(m?.llmId ?? undefined);
  }, [modes]);

  const history = useChatHistory(selectedMode);
  const chat = useChat(history.updateMessages);

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [workspaceModesRefreshNonce, setWorkspaceModesRefreshNonce] = useState(0);
  const [inlineChaptersNonce, setInlineChaptersNonce] = useState(0);
  const [subprojectDialog, setSubprojectDialog] = useState<{ path: string; initialType?: string | null } | null>(null);
  const outlinerScope = useOutlinerScope(project.projectPath ? project.projectPath : null);

  // Ctrl+L: capture editor selection for chat
  const [activeSelection, setActiveSelection] = useState<SelectionContext | null>(null);
  const activeSelectionReplaceFnRef = useRef<((from: number, to: number, text: string) => void) | null>(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  const handleCtrlL = useCallback((sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => {
    setActiveSelection(sel);
    activeSelectionReplaceFnRef.current = replaceFn;
    chatFocusTriggerRef.current?.();
  }, []);

  const handleReplaceSelection = useCallback((replacement: string, ctx: SelectionContext) => {
    if (!activeSelectionReplaceFnRef.current) return;
    activeSelectionReplaceFnRef.current(ctx.from, ctx.to, replacement);
    activeSelectionReplaceFnRef.current = null;
  }, []);

  const handleDismissSelection = useCallback(() => {
    setActiveSelection(null);
    activeSelectionReplaceFnRef.current = null;
  }, []);

  // Project root changes: reset structure and editor state
  useEffect(() => {
    if (!project.projectPath) return;
    chapter.setProjectPath(project.projectPath);
    chapter.closeChapter();
    setSelectedMeta(null);
    setMetaExpanded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

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
      const resolvedId = resolveDefaultModeId(chatModes, configured);
      const resolvedMode = chatModes.find(m => m.id === resolvedId);
      setSelectedMode(resolvedId);
      setUseReasoning(resolvedMode?.useReasoning ?? false);
      setModeLlmId(resolvedMode?.llmId ?? undefined);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadModes();
  }, [loadModes, project.projectPath]);

  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);

  const handleSaveMeta = useCallback(async (
    type: MetaNodeType,
    meta: NodeMeta,
    chapterId: string,
    sceneId?: string,
    actionId?: string,
  ) => {
    if (type === 'book') {
      await bookApi.updateMeta(meta, chapter.structureRoot ?? undefined);
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
  }, [chapter]);

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

  const workspaceModeId = chapter.activeSubprojectType ?? 'default';
  const levelConfigByModeId = useWorkspaceLevelConfigMap(project.projectPath ?? null, workspaceModesRefreshNonce);
  const {
    schema: workspaceModeSchema,
    metaSchemas: workspaceMetaSchemas,
    refresh: refreshWorkspaceModeSchema,
  } = useWorkspaceMode(project.projectPath ?? '', workspaceModeId);

  const proseEditorMode = chapter.activeChapter
    ? (workspaceModeSchema?.editorMode ?? 'prose')
    : 'standard';

  const MediaProjectEditor =
    getMediaProjectPlugin(workspaceModeId)?.ViewComponent ?? DefaultMediaProjectEditor;

  const fileEditor = useFileEditor(project.projectPath ?? null);

  const showMetaChrome =
    selectedMeta != null && (chapter.activeChapter != null || selectedMeta.type === 'book');

  const onProjectGeneralSaved = useCallback(() => {
    loadModes();
    void refreshWorkspaceModeSchema();
  }, [loadModes, refreshWorkspaceModeSchema]);

  const onWorkspacePluginsChanged = useCallback(() => {
    setWorkspaceModesRefreshNonce((n) => n + 1);
    void refreshWorkspaceModeSchema();
  }, [refreshWorkspaceModeSchema]);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      // TODO: reconnect to chapter structure — pass active chapter/scene/action metadata as context
      // Currently sending null as activeFile; replace with chapter context when ContextService is updated
      chat.sendMessage(message, null, selectedMode, refs.referencedFiles, mode?.name, mode?.color, useReasoning, modeLlmId, activeSelection ?? undefined);
      // Clear active selection after sending — the Replace button will use stored selectionContext on the message
      setActiveSelection(null);
    },
    [chat, selectedMode, modes, refs.referencedFiles, useReasoning, modeLlmId, activeSelection],
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
      const fallbackId = resolveDefaultModeId(chatModes, undefined);
      handleModeChange(fallbackId, chatModes);
    }
  }, [modes, selectedMode, handleModeChange]);

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
            <div className={`outliner-slot${showMetaChrome ? ' split' : ''}`}>
              <FileTreeOutliner
                projectPath={project.projectPath ?? null}
                selectedPath={fileEditor.selectedPath}
                onSelectFile={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  void fileEditor.openFile(path);
                }}
              onOpenFileMeta={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  void fileEditor.openFileMeta(path);
                }}
                onRevealInExplorer={() => projectApi.reveal().catch(console.error)}
                refreshNonce={treeRefreshKey}
                onTreeMutated={() => setTreeRefreshKey((k) => k + 1)}
                onFsChange={fileEditor.syncWithFilesystem}
                inlineChaptersRefreshNonce={inlineChaptersNonce}
                activeChapterId={chapter.activeChapter?.id ?? null}
                activeStructureRoot={chapter.structureRoot}
                editorPosition={chapter.editorPosition}
                levelConfigByModeId={levelConfigByModeId}
                onActivateSubprojectStructure={async (subPath, subType, chapterId, scroll, selection) => {
                  chapter.setStructureRoot(subPath, subType);
                  setMetaExpanded(false);
                  await chapter.openChapter(chapterId, scroll ?? null);
                  setSelectedMeta(selection);
                }}
                runSubprojectMutation={async (subPath, subType, fn) => {
                  chapter.setStructureRoot(subPath, subType);
                  await fn();
                }}
                onSubprojectStructureChanged={() => setInlineChaptersNonce((n) => n + 1)}
                onOpenBookMeta={async (subPath, subType) => {
                  chapter.setStructureRoot(subPath, subType);
                  const meta = await bookApi.getMeta(subPath);
                  setSelectedMeta({ type: 'book', chapterId: '', meta });
                  setMetaExpanded(false);
                }}
                onCreateChapterInSubproject={async (subPath, subType, title) => {
                  chapter.setStructureRoot(subPath, subType);
                  await chapter.createChapter(title);
                  setInlineChaptersNonce((n) => n + 1);
                }}
                onConfigureSubproject={(path, existingType) => {
                  setSubprojectDialog({ path, initialType: existingType ?? undefined });
                }}
                scopeToPath={outlinerScope.scopePath}
                onClearOutlinerScope={outlinerScope.clearScopePath}
                onSetOutlinerScope={outlinerScope.setScopePath}
                onScopeInvalidated={outlinerScope.clearScopePath}
              />
            </div>

            {showMetaChrome && selectedMeta && (
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
          {metaExpanded && showMetaChrome ? (
            <div className="meta-panel-center">
              <MetaPanel
                selection={selectedMeta!}
                metaSchemas={workspaceMetaSchemas}
                onSave={handleSaveMeta}
                onClose={() => setMetaExpanded(false)}
                expanded={true}
              />
            </div>
          ) : !chapter.activeChapter ? (
            <MarkdownFileEditor
              path={fileEditor.selectedPath}
              content={fileEditor.content}
              dirty={fileEditor.dirty}
              loading={fileEditor.loading}
              error={fileEditor.error}
              onChange={fileEditor.setContent}
              onSave={() => { void fileEditor.save(); fetchGitState(); }}
              onClearError={fileEditor.clearError}
              shadowContent={fileEditor.shadowContent}
              shadowDirty={fileEditor.shadowDirty}
              shadowExists={fileEditor.shadowExists}
              shadowLoading={fileEditor.shadowLoading}
              shadowError={fileEditor.shadowError}
              shadowPanelOpen={fileEditor.shadowPanelOpen}
              onShadowChange={fileEditor.setShadowContent}
              onShadowSave={() => { void fileEditor.saveShadow(); }}
              onShadowDelete={() => { void fileEditor.deleteShadow(); }}
              onOpenShadowPanel={() => { void fileEditor.openShadowPanel(); }}
              onCloseShadowPanel={fileEditor.closeShadowPanel}
              onCloseFile={fileEditor.closeFile}
              onClearShadowError={fileEditor.clearShadowError}
              onCtrlL={handleCtrlL}
            />
          ) : (
            <MediaProjectEditor
              editorMode={proseEditorMode}
              proseLeafAtScene={workspaceModeSchema?.proseLeafLevel === 'scene'}
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
              onCtrlL={handleCtrlL}
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
            modes={modesForChat}
            selectedMode={selectedMode}
            referencedFiles={refs.referencedFiles}
            conversations={history.conversations}
            activeConversationId={history.activeId}
            useReasoning={useReasoning}
            onToggleReasoning={handleToggleReasoning}
            onModeChange={handleModeChange}
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
            structureRoot={chapter.structureRoot}
            activeSelection={activeSelection}
            onDismissSelection={handleDismissSelection}
            onReplaceSelection={handleReplaceSelection}
            chatFocusTriggerRef={chatFocusTriggerRef}
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
          onWorkspacePluginsChanged={onWorkspacePluginsChanged}
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
          onSaved={() => {
            setTreeRefreshKey((k) => k + 1);
            setInlineChaptersNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

export default App;
