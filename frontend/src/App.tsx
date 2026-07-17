import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  FolderOpen,
  ArrowDown,
  ArrowUp,
  Check,
  GitCommitHorizontal,
  RefreshCw,
  Upload,
  Database,
  Settings,
  Palette,
  Bug,
} from "lucide-react";
import { AppOverlays } from "./components/app/AppOverlays.tsx";
import { TopBarProvider } from "./components/app/TopBarProvider.tsx";
import { Main } from "./components/app/Main.tsx";
import { Editor } from "./components/app/Editor.tsx";
import type { CommandAction } from "./components/git/CommandPalette.tsx";
import type {
  Conversation,
  FileDiffView,
} from "./types.ts";
import { vectorApi, gitApi, filesApi } from "./api.ts";
import { collectBookProjects } from "./utils/bookProjects.ts";

import { usePreferences } from "./hooks/usePreferences.ts";
import { useProject } from "./hooks/useProject.ts";
import { useChapter } from "./hooks/useChapter.ts";
import { useBookProjects } from "./hooks/useBookProjects.ts";
import { useChat } from "./hooks/useChat.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useChatModeToolbar, useSyncChatModeWithHistory } from "./hooks/useChatModeToolbar.ts";
import { useMetaSelection } from "./hooks/useMetaSelection.ts";
import { useInlineChat } from "./hooks/useInlineChat.ts";
import { useAppShortcuts } from "./hooks/useAppShortcuts.ts";
import { useAppOverlays } from "./hooks/useAppOverlays.ts";
import { useAppearanceCss } from "./hooks/useAppearanceCss.ts";
import { useWorkspaceMode } from "./hooks/useWorkspaceMode.ts";
import { useFileTabs } from "./hooks/useFileTabs.ts";
import { useGitState } from "./hooks/useGitState.ts";
import { ArcTimeline } from "./components/arcs/ArcTimeline.tsx";
import { getAppBridge, isRunningInElectron } from "./electron/bridge.ts";
import { getMediaProjectPlugin } from "./mediaProjectRegistry.ts";
import { DefaultMediaProjectEditor } from "./media/DefaultMediaProjectEditor.tsx";
import { InlineChatWindow } from "./components/editor/InlineChatWindow.tsx";

function parseChatHistoryFile(text: string): Conversation[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(
      "Invalid chat history file: expected a JSON array of conversations.",
    );
  }
  return parsed;
}

interface CommandActionsDeps {
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setAppearanceOpen: (open: boolean) => void;
  importFileInputRef: React.RefObject<HTMLInputElement | null>;
  isGitRepo: boolean | undefined;
  hasUncommitted: boolean;
  syncBadge: React.ReactNode;
  fetchGitState: () => void;
}

function buildCommandActions({
  setPaletteOpen,
  setSettingsOpen,
  setAppearanceOpen,
  importFileInputRef,
  isGitRepo,
  hasUncommitted,
  syncBadge,
  fetchGitState,
}: CommandActionsDeps): CommandAction[] {
  return [
    ...(isRunningInElectron()
      ? [
          {
            id: "open-devtools",
            label: "Entwicklertools öffnen",
            icon: <Bug size={16} />,
            handler: () => {
              setPaletteOpen(false);
              void getAppBridge()?.shell?.openDevTools?.();
            },
          } satisfies CommandAction,
        ]
      : []),
    {
      id: "open-folder",
      label: "Open Folder",
      shortcut: "Ctrl+Shift+A",
      icon: <FolderOpen size={16} />,
      handler: () => {},
    },
    {
      id: "project-settings",
      label: "Project Settings",
      icon: <Settings size={16} />,
      handler: () => {
        setPaletteOpen(false);
        setSettingsOpen(true);
      },
    },
    {
      id: "appearance-settings",
      label: "Darstellung / Schrift",
      icon: <Palette size={16} />,
      handler: () => {
        setPaletteOpen(false);
        setAppearanceOpen(true);
      },
    },
    {
      id: "vector-index-update",
      label: "Update Vector Datenbank",
      icon: <Database size={16} />,
      handler: () => {
        void (async () => {
          try {
            const result = await vectorApi.index();
            window.alert(
              `Vector-Datenbank aktualisiert.\n${result.chunkCount} Blöcke · ${result.embeddingModel ?? "—"}`,
            );
          } catch (err) {
            window.alert(
              err instanceof Error
                ? err.message
                : "Vector-Index fehlgeschlagen",
            );
          }
        })();
      },
    },
    {
      id: "import-chat",
      label: "Import Chat History",
      icon: <Upload size={16} />,
      handler: () => {
        importFileInputRef.current?.click();
      },
    },
    ...(isGitRepo === false
      ? [
          {
            id: "git-init",
            label: "Git Repository initialisieren",
            icon: <GitCommitHorizontal size={16} />,
            handler: () => {
              void (async () => {
                try {
                  await gitApi.init();
                  await fetchGitState();
                } catch (err) {
                  window.alert(
                    err instanceof Error
                      ? err.message
                      : "Git-Init fehlgeschlagen",
                  );
                }
              })();
            },
          } satisfies CommandAction,
        ]
      : [
          hasUncommitted
            ? {
                id: "git-commit",
                label: "Commit",
                icon: <GitCommitHorizontal size={16} />,
                handler: () => {},
              }
            : {
                id: "git-sync",
                label: "Sync",
                icon: <RefreshCw size={16} />,
                badge: syncBadge,
                handler: () => {},
              },
        ]),
  ];
}

function App() {
  const project = useProject();
  const chapter = useChapter();
  const bookProjects = useBookProjects(project.projectPath ?? null);
  const { preferences, updatePreferences } = usePreferences();
  const {
    paletteOpen,
    setPaletteOpen,
    settingsOpen,
    setSettingsOpen,
    searchOpen,
    setSearchOpen,
    arcsOpen,
    setArcsOpen,
    contentBrowserOpen,
    setContentBrowserOpen,
    appearanceOpen,
    setAppearanceOpen,
  } = useAppOverlays();

  useAppearanceCss(preferences);

  const toolbar = useChatModeToolbar(project.projectPath ?? null);
  const {
    modes,
    selectedMode,
    useReasoning,
    setUseReasoning,
    reasoningEffort,
    setReasoningEffort,
    webSearchAvailable,
    modeLlmId,
    setModeLlmId,
    llms,
    disabledToolkits,
    setDisabledToolkits,
    rulesEnabled,
    setRulesEnabled,
    loadModes,
    handleModeChange,
  } = toolbar;

  const history = useChatHistory(selectedMode, project.projectPath);
  const chat = useChat(history.updateMessages);
  useSyncChatModeWithHistory(toolbar, history, project.projectPath ?? null);

  const [subprojectDialog, setSubprojectDialog] = useState<{
    path: string;
    initialType?: string | null;
  } | null>(null);

  const inlineChat = useInlineChat({
    modes,
    selectedMode,
    useReasoning,
    modeLlmId,
    disabledToolkits,
    setDisabledToolkits,
    rulesEnabled,
    reasoningEffort,
    chat,
    history,
  });
  const {
    altVersionSession,
    handleAltVersion,
    handleCloseAltVersion,
    inlineChatFiles,
    handleInlineChatAddFile,
    handleInlineChatRemoveFile,
    handleInlineChatSend,
    handleInlineChatToggleToolkit,
    handleInlineChatEditMessage,
    handleInlineChatForkToNew,
    handleInlineChatStartThread,
    handleInlineChatSettleSnapshots,
  } = inlineChat;

  useEffect(() => {
    if (!project.projectPath) return;
    const projectPath = project.projectPath;
    chapter.setProjectPath(projectPath);
    chapter.closeChapter();
    void (async () => {
      const lastPos = chapter.peekLastPosition(projectPath);
      let root: string | null = null;
      let subprojectType: string | null = null;
      if (lastPos?.structureRoot) {
        root = lastPos.structureRoot;
        try {
          const tree = await filesApi.getTree();
          const match = collectBookProjects(tree).find((p) => p.path === root);
          subprojectType = match?.subprojectType ?? null;
        // eslint-disable-next-line no-empty
        } catch {}
      }
      chapter.setStructureRoot(root, subprojectType);
      const list = await chapter.refreshChapters();
      if (list.length === 0) return;
      const restored = chapter.restoreLastPosition(projectPath, root);
      const restoredValid = restored && list.some((c) => c.id === restored.chapterId);
      if (restoredValid) {
        await chapter.openChapter(restored.chapterId, restored.scrollTarget);
      } else {
        await chapter.openChapter(list[0].id);
      }
    })();
    handleClearMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  const metaSelection = useMetaSelection(chapter);
  const {
    selectedMeta,
    focusedField,
    handleSaveMeta,
    handleFieldEditorSave,
    handleOpenFieldEditor,
    handleCloseFieldEditor,
    handleClearMeta,
  } = metaSelection;

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportChatFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result;
        if (typeof text !== "string") return;
        try {
          history.importConversations(parseChatHistoryFile(text));
        } catch (err) {
          window.alert(
            err instanceof Error
              ? err.message
              : "Failed to parse chat history file. Make sure it is a valid JSON file.",
          );
        }
      };
      reader.readAsText(file);
    },
    [history],
  );
  const git = useGitState(project.projectPath ?? null, paletteOpen);
  const {
    gitStatus,
    syncStatus,
    fetchGitState,
    credDialogOpen,
    setCredDialogOpen,
    pendingRetry,
    setPendingRetry,
    fileHistoryPath,
    setFileHistoryPath,
    showCredentialsDialog,
  } = git;
  const hasUncommitted = !gitStatus?.isClean;

  const handleTogglePalette = useCallback(() => setPaletteOpen((prev) => !prev), [setPaletteOpen]);
  const handleToggleSearch = useCallback(() => setSearchOpen((prev) => !prev), [setSearchOpen]);
  const handleToggleArcs = useCallback(() => setArcsOpen((prev) => !prev), [setArcsOpen]);
  const handleToggleContentBrowser = useCallback(() => setContentBrowserOpen((prev) => !prev), [setContentBrowserOpen]);

  const { quickChatOpen, onCloseQuickChat } = useAppShortcuts({
    activeChapter: chapter.activeChapter,
    chatFontSizePx: preferences.appearance.chatFontSizePx,
    updatePreferences,
    onTogglePalette: handleTogglePalette,
    onToggleSearch: handleToggleSearch,
    onToggleArcs: handleToggleArcs,
    onToggleContentBrowser: handleToggleContentBrowser,
  });

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

  const handleOpenProject = useCallback(
    async (path: string) => {
      await project.openProject(path);
      await chapter.refreshChapters();
      loadModes();
    },
    [project, chapter, loadModes],
  );

  const workspaceModeId = chapter.activeSubprojectType ?? "default";
  const {
    schema: workspaceModeSchema,
    metaSchemas: workspaceMetaSchemas,
    refresh: refreshWorkspaceModeSchema,
  } = useWorkspaceMode(project.projectPath ?? "", workspaceModeId);

  const proseEditorMode = chapter.activeChapter
    ? (workspaceModeSchema?.editorMode ?? "prose")
    : "standard";

  const MediaProjectEditor =
    getMediaProjectPlugin(workspaceModeId)?.ViewComponent ??
    DefaultMediaProjectEditor;

  const fileEditor = useFileTabs(project.projectPath ?? null);

  const [fileDiffView, setFileDiffView] = useState<FileDiffView | null>(null);

  const handleOpenFileDiff = useCallback(
    (path: string, originalContent: string, label: string) => {
      chapter.closeChapter();
      void fileEditor.openFile(path);
      setFileDiffView({ path, content: originalContent, label });
    },
    [chapter, fileEditor],
  );

  const handleSelectBookProject = useCallback(
    async (path: string, subprojectType: string | null) => {
      const root = path === "." ? null : path;
      handleClearMeta();
      chapter.setStructureRoot(root, subprojectType);
      const list = await chapter.refreshChapters();
      if (list.length > 0) {
        await chapter.openChapter(list[0].id);
      } else {
        chapter.closeChapter();
      }
    },
    [chapter, handleClearMeta],
  );

  const handleSelectChapterTab = useCallback(
    (chapterId: string) => {
      handleClearMeta();
      void chapter.openChapter(chapterId);
    },
    [chapter, handleClearMeta],
  );

  const commandActions: CommandAction[] = useMemo(
    () =>
      buildCommandActions({
        setPaletteOpen,
        setSettingsOpen,
        setAppearanceOpen,
        importFileInputRef,
        isGitRepo: gitStatus?.isRepo,
        hasUncommitted,
        syncBadge,
        fetchGitState,
      }),
    [hasUncommitted, syncBadge, gitStatus?.isRepo, fetchGitState, setPaletteOpen, setSettingsOpen, setAppearanceOpen],
  );

  const showMetaChrome =
    selectedMeta != null &&
    (chapter.activeChapter != null || selectedMeta.type === "book");

  const onProjectGeneralSaved = useCallback(() => {
    loadModes();
    void refreshWorkspaceModeSchema();
  }, [loadModes, refreshWorkspaceModeSchema]);

  const onWorkspacePluginsChanged = useCallback(() => {
    void refreshWorkspaceModeSchema();
  }, [refreshWorkspaceModeSchema]);

  const handleContentBrowserSelectFile = useCallback(
    (path: string) => {
      chapter.closeChapter();
      handleClearMeta();
      void fileEditor.openFile(path);
    },
    [chapter, fileEditor, handleClearMeta],
  );

  const handleCredSuccess = useCallback(() => {
    setCredDialogOpen(false);
    pendingRetry?.();
    setPendingRetry(null);
  }, [setCredDialogOpen, pendingRetry, setPendingRetry]);

  const handleCredCancel = useCallback(() => {
    setCredDialogOpen(false);
    setPendingRetry(null);
  }, [setCredDialogOpen, setPendingRetry]);

  const handleSubprojectSaved = useCallback(() => {
    void chapter.refreshChapters();
    void refreshWorkspaceModeSchema();
  }, [chapter, refreshWorkspaceModeSchema]);

  const handleClosePalette = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);
  const handleCloseContentBrowser = useCallback(() => setContentBrowserOpen(false), [setContentBrowserOpen]);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const handleCloseSubproject = useCallback(() => setSubprojectDialog(null), []);
  const handleCloseFileHistory = useCallback(() => setFileHistoryPath(null), [setFileHistoryPath]);
  const handleCloseAppearance = useCallback(() => setAppearanceOpen(false), [setAppearanceOpen]);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), [setSearchOpen]);
  const handleCloseArcs = useCallback(() => setArcsOpen(false), [setArcsOpen]);
  const handleOpenArcsPanel = useCallback(() => setArcsOpen(true), [setArcsOpen]);

  const handleArcTimelineOpenFile = useCallback(
    (path: string) => {
      setArcsOpen(false);
      handleContentBrowserSelectFile(path);
    },
    [setArcsOpen, handleContentBrowserSelectFile],
  );

  const handleToggleReasoning = useCallback(() => setUseReasoning((v) => !v), [setUseReasoning]);
  const handleToggleRules = useCallback(() => setRulesEnabled((v) => !v), [setRulesEnabled]);
  const handleInlineChatModeChange = useCallback(
    (id: string) => handleModeChange(id),
    [handleModeChange],
  );
  const handleNewChat = useCallback(
    (title?: string) => history.createConversation(selectedMode, undefined, title),
    [history, selectedMode],
  );
  const handleDiscardCurrentChat = useCallback(
    (title?: string) => history.discardActiveAndCreateConversation(selectedMode, title),
    [history, selectedMode],
  );

  return (
    <div className="app">
      <AppOverlays
        paletteOpen={paletteOpen}
        onClosePalette={handleClosePalette}
        commandActions={commandActions}
        onOpenFolder={handleOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus}
        onAuthRequired={showCredentialsDialog}
        onOpenFileDiff={handleOpenFileDiff}
        contentBrowserOpen={contentBrowserOpen}
        projectPath={project.projectPath ?? null}
        onCloseContentBrowser={handleCloseContentBrowser}
        onSelectFile={handleContentBrowserSelectFile}
        credDialogOpen={credDialogOpen}
        onCredSuccess={handleCredSuccess}
        onCredCancel={handleCredCancel}
        settingsOpen={settingsOpen}
        onCloseSettings={handleCloseSettings}
        onModesChanged={loadModes}
        onGeneralConfigSaved={onProjectGeneralSaved}
        onWorkspacePluginsChanged={onWorkspacePluginsChanged}
        subprojectDialog={subprojectDialog}
        onCloseSubproject={handleCloseSubproject}
        onSubprojectSaved={handleSubprojectSaved}
        fileHistoryPath={fileHistoryPath}
        onCloseFileHistory={handleCloseFileHistory}
        appearanceOpen={appearanceOpen}
        preferences={preferences}
        onUpdatePreferences={updatePreferences}
        onCloseAppearance={handleCloseAppearance}
        importFileInputRef={importFileInputRef}
        onImportChatFile={handleImportChatFile}
      />

      <TopBarProvider>
        <Main>
          <Editor
            fileEditor={fileEditor}
            chapter={chapter}
            MediaProjectEditor={MediaProjectEditor}
            proseEditorMode={proseEditorMode}
            proseLeafAtScene={workspaceModeSchema?.proseLeafLevel === "scene"}
            bookProjects={bookProjects}
            onSelectBookProject={handleSelectBookProject}
            onSelectChapterTab={handleSelectChapterTab}
            searchOpen={searchOpen}
            onCloseSearch={handleCloseSearch}
            selectedMeta={selectedMeta}
            focusedField={focusedField}
            showMetaChrome={showMetaChrome}
            workspaceMetaSchemas={workspaceMetaSchemas}
            onSaveMeta={handleSaveMeta}
            onFieldEditorSave={handleFieldEditorSave}
            onOpenFieldEditor={handleOpenFieldEditor}
            onClearMeta={handleClearMeta}
            onCloseFieldEditor={handleCloseFieldEditor}
            fileDiffView={fileDiffView}
            setFileDiffView={setFileDiffView}
            fetchGitState={fetchGitState}
            onAltVersion={handleAltVersion}
            quickChatOpen={quickChatOpen}
            onCloseQuickChat={onCloseQuickChat}
            llms={llms}
            webSearchAvailable={webSearchAvailable}
            disabledToolkits={disabledToolkits}
          />
        </Main>
      </TopBarProvider>

      <ArcTimeline
        open={arcsOpen}
        onClose={handleCloseArcs}
        onOpenFile={handleArcTimelineOpenFile}
      />

      {altVersionSession && (
        <InlineChatWindow
          session={altVersionSession}
          onClose={handleCloseAltVersion}
          messages={chat.messages}
          streaming={chat.streaming}
          error={chat.error}
          toolActivity={chat.toolActivity}
          modes={modes}
          selectedMode={selectedMode}
          referencedFiles={inlineChatFiles}
          conversations={history.conversations}
          activeConversationId={history.activeId}
          useReasoning={useReasoning}
          onToggleReasoning={handleToggleReasoning}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
          disabledToolkits={disabledToolkits}
          onToggleToolkit={handleInlineChatToggleToolkit}
          rulesEnabled={rulesEnabled}
          onToggleRules={handleToggleRules}
          onModeChange={handleInlineChatModeChange}
          onSend={handleInlineChatSend}
          onStop={chat.stopStreaming}
          onAddFile={handleInlineChatAddFile}
          onRemoveFile={handleInlineChatRemoveFile}
          onForkFromMessage={chat.forkFromMessage}
          onForkToNewConversation={handleInlineChatForkToNew}
          onStartThreadFromMessage={handleInlineChatStartThread}
          onEditMessage={handleInlineChatEditMessage}
          onDeleteMessages={chat.deleteMessages}
          onSetMessageFeedback={chat.setMessageFeedback}
          onNewChat={handleNewChat}
          onDiscardCurrentChat={handleDiscardCurrentChat}
          onSwitchChat={history.switchConversation}
          onDeleteChat={history.deleteConversation}
          onRenameChat={history.renameConversation}
          onToggleSavedToProject={history.toggleSavedToProject}
          onClearAllBrowserChats={history.clearAllBrowserChats}
          clearAllBrowserChatsDisabled={false}
          onOpenArcs={handleOpenArcsPanel}
          structureRoot={chapter.structureRoot}
          onRetry={chat.retry}
          writeFileSettled={history.activeConversation.writeFileSettled}
          onSettleSnapshots={handleInlineChatSettleSnapshots}
          llms={llms}
          selectedLlmId={modeLlmId}
          onLlmChange={setModeLlmId}
          theme={preferences.appearance.theme === "light" ? "light" : "dark"}
          contextInfo={chat.contextInfo}
          activeFile={null}
          isDirty={false}
        />
      )}
    </div>
  );
}

export default App;
