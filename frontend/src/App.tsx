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
  Mode,
  Conversation,
  MetaSelection,
  MetaNodeType,
  NodeMeta,
  SelectionContext,
  AltVersionSession,
  ChatRequest,
  LlmPublic,
  ReasoningEffort,
} from "./types.ts";
import {
  modesApi,
  projectConfigApi,
  bookApi,
  llmApi,
  vectorApi,
  gitApi,
  streamChat,
  filesApi,
} from "./api.ts";
import { collectBookProjects } from "./utils/bookProjects.ts";

import { usePreferences } from "./hooks/usePreferences.ts";
import { useProject } from "./hooks/useProject.ts";
import { useChapter } from "./hooks/useChapter.ts";
import { useBookProjects } from "./hooks/useBookProjects.ts";
import { useChat } from "./hooks/useChat.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useWorkspaceMode } from "./hooks/useWorkspaceMode.ts";
import { useFileTabs } from "./hooks/useFileTabs.ts";
import { useGitState } from "./hooks/useGitState.ts";
import { ArcTimeline } from "./components/arcs/ArcTimeline.tsx";
import { getAppBridge, isRunningInElectron } from "./electron/bridge.ts";
import { getMediaProjectPlugin } from "./mediaProjectRegistry.ts";
import { DefaultMediaProjectEditor } from "./media/DefaultMediaProjectEditor.tsx";
import { AlternativeVersionPanel } from "./components/editor/AlternativeVersionPanel.tsx";
import { resolveDefaultModeId } from "./components/chat/effectiveChatModeForRequest.ts";
import {
  loadInitialDisabledToolkits,
  saveDisabledToolkits,
  loadInitialRulesEnabled,
  saveRulesEnabled,
  loadLlmPrefs,
  saveLlmPrefs,
} from "./utils/chatStorage.ts";

function conversationHasVisibleMessages(conv: Conversation): boolean {
  return conv.messages.some((m) => !m.hidden);
}

function App() {
  const project = useProject();
  const chapter = useChapter();
  const bookProjects = useBookProjects(project.projectPath ?? null);
  const { preferences, updatePreferences } = usePreferences();
  const chatFontSizePxRef = useRef(preferences.appearance.chatFontSizePx ?? 14);
  chatFontSizePxRef.current = preferences.appearance.chatFontSizePx ?? 14;
  // Mirror of the active chapter for the global keydown listener (Alt+E), which
  // is registered once and must read the current value without re-binding.
  const activeChapterRef = useRef(chapter.activeChapter);
  activeChapterRef.current = chapter.activeChapter;
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState("review");
  const [useReasoning, setUseReasoning] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);
  const [llms, setLlms] = useState<LlmPublic[]>([]);
  const llmsRef = useRef(llms);
  llmsRef.current = llms;
  const [disabledToolkits] = useState(loadInitialDisabledToolkits);
  const [rulesEnabled] = useState(loadInitialRulesEnabled);

  // Apply user appearance preferences as CSS variables on the document root
  useEffect(() => {
    const a = preferences.appearance;
    if (a.fontFamily) {
      document.documentElement.style.setProperty(
        "--pref-font-family",
        a.fontFamily,
      );
    }
    if (a.chatFontSizePx) {
      document.documentElement.style.setProperty(
        "--pref-chat-font-size",
        `${a.chatFontSizePx}px`,
      );
    }
    document.body.classList.toggle("theme-light", a.theme === "light");
  }, [preferences]);

  const prefsHydratedRef = useRef(false);
  /** Last resolved project default chat mode id (from loadModes); used for empty chats and fallbacks. */
  const projectDefaultChatModeIdRef = useRef("review");
  /**
   * Ref-mirrors of toolbar state so the conv-sync effect can read current values without
   * listing them as reactive deps — which would cause snap-back any time the user changes
   * mode, LLM, or reasoning (handleModeChange sets all three at once).
   */
  const selectedModeRef = useRef(selectedMode);
  selectedModeRef.current = selectedMode;
  /**
   * Skips re-running applyLlmPrefsFromStorage on every mode-sync effect pass (same project/chat/load gen).
   * Re-applying on each pass caused setState + dependency churn → maximum update depth exceeded.
   * Cleared when the active conversation has agent execution so switching back to a normal chat re-syncs prefs.
   */
  const lastNonAgentToolbarPrefsSyncRef = useRef<{
    projectPath: string;
    activeId: string;
    loadGen: number;
    /** Re-sync when mode list reloads (e.g. loadModes after settings) without bumping loadGen. */
    modesSig: string;
  } | null>(null);

  const handleModeChange = useCallback(
    (modeId: string, modeList?: typeof modes) => {
      const list = modeList ?? modes;
      const m = list.find((x) => x.id === modeId);
      const llmId = m?.llmId ?? undefined;

      let newUseReasoning = m?.useReasoning ?? false;
      if (llmId) {
        const llm = llms.find((l) => l.id === llmId);
        if (llm) {
          const hasReasoning = !!llm.reasoningModel;
          const hasFast = !!llm.fastModel;
          if (!hasReasoning) {
            newUseReasoning = false;
          } else if (!hasFast) {
            newUseReasoning = true;
          }
          // both available → use mode preference
        }
      }

      // Functional updates avoid redundant renders and break feedback loops with useChatHistory(currentMode).
      setSelectedMode((prev) => (prev === modeId ? prev : modeId));
      setModeLlmId((prev) => (prev === llmId ? prev : llmId));
      setUseReasoning((prev) =>
        prev === newUseReasoning ? prev : newUseReasoning,
      );
    },
    [modes, llms],
  );

  const applyLlmPrefsFromStorage = useCallback(() => {
    const providers = llmsRef.current;
    const prefs = loadLlmPrefs();
    if (!prefs) return;
    const { llmId, useReasoning: savedReasoning, reasoningEffort: savedEffort } = prefs;
    setReasoningEffort(savedEffort);
    if (llmId !== null) {
      const llm = providers.find((l) => l.id === llmId);
      if (llm) {
        setModeLlmId(llmId);
        const hasReasoning = !!llm.reasoningModel;
        const hasFast = !!llm.fastModel;
        if (!hasReasoning) setUseReasoning(false);
        else if (!hasFast) setUseReasoning(true);
        else setUseReasoning(savedReasoning);
      } else {
        setUseReasoning(savedReasoning);
      }
    } else {
      setUseReasoning(savedReasoning);
    }
  }, []);

  const history = useChatHistory(selectedMode, project.projectPath);
  const chat = useChat(history.updateMessages);

  /** Bumped after modes + LLM list load so chat mode can sync once project defaults are known. */
  const [modesAndLlmLoadGeneration, setModesAndLlmLoadGeneration] = useState(0);

  const [subprojectDialog, setSubprojectDialog] = useState<{
    path: string;
    initialType?: string | null;
  } | null>(null);

  // Ctrl+L: capture editor selection for chat
  const [, setActiveSelection] = useState<SelectionContext | null>(null);
  const activeSelectionReplaceFnRef = useRef<
    ((from: number, to: number, text: string) => void) | null
  >(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  // Ctrl+Alt+A: alternative version panel
  const [altVersionSession, setAltVersionSession] =
    useState<AltVersionSession | null>(null);

  const handleCtrlL = useCallback(
    (
      sel: SelectionContext,
      replaceFn: (from: number, to: number, text: string) => void,
    ) => {
      setActiveSelection(sel);
      activeSelectionReplaceFnRef.current = replaceFn;
      chatFocusTriggerRef.current?.();
    },
    [],
  );

  const handleAltVersion = useCallback((session: AltVersionSession) => {
    setAltVersionSession(session);
  }, []);

  // Inline AI: stream a one-shot completion for the AltVersion / inline panel.
  // Self-contained prompt (no chat history, minimal context) so the model returns
  // clean prose to drop straight into the editor. Uses the currently selected mode
  // so the writing persona carries over.
  const inlineGenerate = useCallback(
    (
      prompt: string,
      cbs: {
        onToken: (t: string) => void;
        onDone: (full: string) => void;
        onError: (e: Error) => void;
      },
    ) => {
      const request: ChatRequest = {
        message: prompt,
        activeFieldKey: null,
        mode: selectedModeRef.current,
        referencedFiles: [],
        history: [],
        useReasoning: false,
        quickChat: true,
      };
      return streamChat(
        request,
        cbs.onToken,
        () => {},
        cbs.onDone,
        cbs.onError,
      );
    },
    [],
  );

  // Project root changes: reset structure and editor state, then default into the chapter view
  useEffect(() => {
    if (!project.projectPath) return;
    const projectPath = project.projectPath;
    chapter.setProjectPath(projectPath);
    chapter.closeChapter();
    void (async () => {
      // The last-edited chapter may live under a book subproject rather than the
      // project root, so resolve its structure root/type before listing chapters.
      const lastPos = chapter.peekLastPosition(projectPath);
      let root: string | null = null;
      let subprojectType: string | null = null;
      if (lastPos?.structureRoot) {
        root = lastPos.structureRoot;
        try {
          const tree = await filesApi.getTree();
          const match = collectBookProjects(tree).find((p) => p.path === root);
          subprojectType = match?.subprojectType ?? null;
        } catch {
          /* fall back to root project below */
        }
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
    setSelectedMeta(null);
    setMetaExpanded(false);
    setFocusedField(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  const loadModes = useCallback(async () => {
    try {
      const [mds, status] = await Promise.all([
        modesApi.getAll(),
        projectConfigApi.status(),
      ]);
      setModes(mds);
      let configured: string | undefined;
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
        } catch {
          /* ignore */
        }
      }
      const resolvedId = resolveDefaultModeId(mds, configured);
      projectDefaultChatModeIdRef.current = resolvedId;
      const resolvedMode = mds.find((m) => m.id === resolvedId);
      setSelectedMode(resolvedId);
      setUseReasoning(resolvedMode?.useReasoning ?? false);
      setModeLlmId(resolvedMode?.llmId ?? undefined);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    prefsHydratedRef.current = false;
    let cancelled = false;
    const llmsPromise = llmApi
      .list()
      .then((r) => {
        if (!cancelled) {
          setLlms(r.providers);
          llmsRef.current = r.providers;
          setWebSearchAvailable(!!r.webSearchAvailable);
        }
      })
      .catch(console.error);

    Promise.all([loadModes(), llmsPromise]).then(() => {
      if (cancelled) return;
      prefsHydratedRef.current = true;
      applyLlmPrefsFromStorage();
      setModesAndLlmLoadGeneration((g) => g + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [loadModes, project.projectPath, applyLlmPrefsFromStorage]);

  // Sync main chat Mode selector with the active conversation (initial load + chat switch).
  useEffect(() => {
    if (!history.hydrated || modes.length === 0) return;
    const conv = history.activeConversation;
    let desired: string;
    /** Threads (and similar) can have only hidden bootstrap messages — still use conv.mode / history, not project default. */
    const trulyEmptyForModeSync =
      !conversationHasVisibleMessages(conv) && conv.messages.length === 0;
    if (trulyEmptyForModeSync) {
      // Prefer the conversation's own stored mode (set at creation or by the useChatHistory
      // single-conv effect) so that manual toolbar changes on empty chats are not snapped back.
      if (conv.mode && modes.some((m) => m.id === conv.mode)) {
        desired = conv.mode;
      } else {
        desired = projectDefaultChatModeIdRef.current;
        if (!modes.some((m) => m.id === desired)) {
          desired = resolveDefaultModeId(modes, undefined);
        }
      }
    } else {
      let fromConv: string | null = null;
      if (conv.mode && modes.some((m) => m.id === conv.mode)) {
        fromConv = conv.mode;
      } else {
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          const m = conv.messages[i];
          if (m.hidden || m.role !== "user" || !m.mode) continue;
          const found = modes.find((mode) => mode.name === m.mode);
          if (found) {
            fromConv = found.id;
            break;
          }
        }
      }
      desired = fromConv ?? projectDefaultChatModeIdRef.current;
      if (!modes.some((m) => m.id === desired)) {
        desired = resolveDefaultModeId(modes, undefined);
      }
    }
    // Only apply mode row when the resolved id differs; otherwise handleModeChange would still
    // rewrite llm/reasoning from the mode and fight the prefs block below → update depth loops.
    // Read via ref so that a manual user mode-change does not re-trigger this effect and snap back.
    if (desired !== selectedModeRef.current) {
      handleModeChange(desired, modes);
    }

    if (prefsHydratedRef.current) {
      const pp = project.projectPath ?? "";
      const aid = history.activeId;
      const gen = modesAndLlmLoadGeneration;
      const modesSig = modes.map((m) => m.id).join("\0");
      const prevSync = lastNonAgentToolbarPrefsSyncRef.current;
      if (
        !prevSync ||
        prevSync.projectPath !== pp ||
        prevSync.activeId !== aid ||
        prevSync.loadGen !== gen ||
        prevSync.modesSig !== modesSig
      ) {
        lastNonAgentToolbarPrefsSyncRef.current = {
          projectPath: pp,
          activeId: aid,
          loadGen: gen,
          modesSig,
        };
        applyLlmPrefsFromStorage();
      }
    }
  }, [
    history.hydrated,
    history.activeId,
    history.activeConversation.mode,
    modes,
    project.projectPath,
    modesAndLlmLoadGeneration,
    handleModeChange,
    applyLlmPrefsFromStorage,
    // selectedMode, modeLlmId, useReasoning, disabledToolkits intentionally omitted:
    // all four are read via refs so that handleModeChange (which sets all four at once)
    // does not re-trigger this effect and snap the selector back to the conversation mode.
  ]);

  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    saveLlmPrefs(modeLlmId, useReasoning, reasoningEffort);
  }, [modeLlmId, useReasoning, reasoningEffort]);

  useEffect(() => {
    saveDisabledToolkits(disabledToolkits);
  }, [disabledToolkits]);

  useEffect(() => {
    saveRulesEnabled(rulesEnabled);
  }, [rulesEnabled]);

  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [, setMetaExpanded] = useState(false);
  const [focusedField, setFocusedField] = useState<{
    fieldKey: string;
    fieldLabel: string;
    value: string;
  } | null>(null);

  const handleSaveMeta = useCallback(
    async (
      type: MetaNodeType,
      meta: NodeMeta,
      chapterId: string,
      sceneId?: string,
      actionId?: string,
    ) => {
      if (type === "book") {
        await bookApi.updateMeta(meta, chapter.structureRoot ?? undefined);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "chapter") {
        await chapter.updateChapterMeta(chapterId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "scene" && sceneId) {
        await chapter.updateSceneMeta(chapterId, sceneId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "action" && sceneId && actionId) {
        await chapter.updateActionMeta(chapterId, sceneId, actionId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      }
    },
    [chapter],
  );

  const handleApplyFieldUpdate = useCallback(
    async (field: string, value: string) => {
      if (
        !selectedMeta ||
        selectedMeta.type !== "scene" ||
        !selectedMeta.sceneId
      )
        return;
      const curr = selectedMeta.meta;
      const newMeta: NodeMeta =
        field === "title"
          ? { ...curr, title: value }
          : field === "description"
            ? { ...curr, description: value }
            : { ...curr, extras: { ...(curr.extras ?? {}), [field]: value } };
      await handleSaveMeta(
        "scene",
        newMeta,
        selectedMeta.chapterId,
        selectedMeta.sceneId,
      );
      // Keep field editor in sync when the AI applies a suggestion via chat
      setFocusedField((prev) =>
        prev?.fieldKey === field ? { ...prev, value } : prev,
      );
    },
    [selectedMeta, handleSaveMeta],
  );

  const handleOpenFieldEditor = useCallback(
    (fieldKey: string, fieldLabel: string, value: string) => {
      setFocusedField({ fieldKey, fieldLabel, value });
      setMetaExpanded(false);
    },
    [],
  );

  const handleFieldEditorSave = useCallback(
    async (value: string) => {
      if (!focusedField) return;
      await handleApplyFieldUpdate(focusedField.fieldKey, value);
    },
    [focusedField, handleApplyFieldUpdate],
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [arcsOpen, setArcsOpen] = useState(false);
  const [contentBrowserOpen, setContentBrowserOpen] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportChatFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (typeof text !== "string") return;
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            window.alert(
              "Invalid chat history file: expected a JSON array of conversations.",
            );
            return;
          }
          history.importConversations(parsed);
        } catch {
          window.alert(
            "Failed to parse chat history file. Make sure it is a valid JSON file.",
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Allow regular character input (like "ß", "ä", "ö", "ü", etc.)
      // Only handle shortcuts when no character is being typed
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        return; // Regular character - let it pass through
      }
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        setArcsOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        setContentBrowserOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Allow regular character input (like "ß", "ä", "ö", "ü", etc.)
      // Don't interfere with normal typing
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.code.startsWith("Numpad")) {
        return; // Regular character - let it pass through
      }
      // Allow AltGr (Alt+Ctrl) for character input like "ß"
      // Only return early if Ctrl/Meta is pressed WITHOUT Alt (not AltGr)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) return;

      if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        // QuickChat is writer-scoped: only toggle when a chapter is open.
        if (activeChapterRef.current) setQuickChatOpen((v) => !v);
        return;
      }

      // Num+ / Num- for font size adjustment
      if ((e.code === "NumpadAdd" || e.code === "Equal") && !e.shiftKey) {
        e.preventDefault();
        updatePreferences({
          appearance: {
            chatFontSizePx: Math.min(22, chatFontSizePxRef.current + 1),
          },
        });
        return;
      }
      if ((e.code === "NumpadSubtract" || e.code === "Minus") && !e.shiftKey) {
        e.preventDefault();
        updatePreferences({
          appearance: {
            chatFontSizePx: Math.max(10, chatFontSizePxRef.current - 1),
          },
        });
        return;
      }

    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- single global shortcut registration
  }, []);

  // QuickChat is writer-scoped: close it whenever no chapter is open so it does
  // not reappear when a chapter is later reopened.
  useEffect(() => {
    if (!chapter.activeChapter) setQuickChatOpen(false);
  }, [chapter.activeChapter]);

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

  const [fileDiffView, setFileDiffView] = useState<{
    path: string;
    content: string;
    label: string;
  } | null>(null);

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
      setSelectedMeta(null);
      setMetaExpanded(false);
      setFocusedField(null);
      chapter.setStructureRoot(root, subprojectType);
      const list = await chapter.refreshChapters();
      if (list.length > 0) {
        await chapter.openChapter(list[0].id);
      } else {
        chapter.closeChapter();
      }
    },
    [chapter],
  );

  const handleSelectChapterTab = useCallback(
    (chapterId: string) => {
      setSelectedMeta(null);
      setMetaExpanded(false);
      setFocusedField(null);
      void chapter.openChapter(chapterId);
    },
    [chapter],
  );

  const commandActions: CommandAction[] = useMemo(() => {
    const actions: CommandAction[] = [
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
      ...(gitStatus?.isRepo === false
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
    return actions;
  }, [hasUncommitted, syncBadge, gitStatus?.isRepo, fetchGitState]);

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

  // ── AppOverlays callbacks (lifted out of inline JSX) ──────────────────────
  const handleContentBrowserSelectFile = useCallback(
    (path: string) => {
      chapter.closeChapter();
      setSelectedMeta(null);
      setMetaExpanded(false);
      setFocusedField(null);
      void fileEditor.openFile(path);
    },
    [chapter, fileEditor],
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
    // The subproject-type dialog trigger is not currently wired; when it is,
    // refresh the structure/schema so the new type takes effect.
    void chapter.refreshChapters();
    void refreshWorkspaceModeSchema();
  }, [chapter, refreshWorkspaceModeSchema]);

  const handleClearMeta = useCallback(() => {
    setSelectedMeta(null);
    setMetaExpanded(false);
    setFocusedField(null);
  }, []);

  return (
    <div className="app">
      <AppOverlays
        paletteOpen={paletteOpen}
        onClosePalette={() => setPaletteOpen(false)}
        commandActions={commandActions}
        onOpenFolder={handleOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus}
        onAuthRequired={showCredentialsDialog}
        onOpenFileDiff={handleOpenFileDiff}
        contentBrowserOpen={contentBrowserOpen}
        projectPath={project.projectPath ?? null}
        onCloseContentBrowser={() => setContentBrowserOpen(false)}
        onSelectFile={handleContentBrowserSelectFile}
        credDialogOpen={credDialogOpen}
        onCredSuccess={handleCredSuccess}
        onCredCancel={handleCredCancel}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        onModesChanged={loadModes}
        onGeneralConfigSaved={onProjectGeneralSaved}
        onWorkspacePluginsChanged={onWorkspacePluginsChanged}
        subprojectDialog={subprojectDialog}
        onCloseSubproject={() => setSubprojectDialog(null)}
        onSubprojectSaved={handleSubprojectSaved}
        fileHistoryPath={fileHistoryPath}
        onCloseFileHistory={() => setFileHistoryPath(null)}
        appearanceOpen={appearanceOpen}
        preferences={preferences}
        onUpdatePreferences={updatePreferences}
        onCloseAppearance={() => setAppearanceOpen(false)}
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
            onCloseSearch={() => setSearchOpen(false)}
            selectedMeta={selectedMeta}
            focusedField={focusedField}
            showMetaChrome={showMetaChrome}
            workspaceMetaSchemas={workspaceMetaSchemas}
            onSaveMeta={handleSaveMeta}
            onFieldEditorSave={handleFieldEditorSave}
            onOpenFieldEditor={handleOpenFieldEditor}
            onClearMeta={handleClearMeta}
            onCloseFieldEditor={() => setFocusedField(null)}
            fileDiffView={fileDiffView}
            setFileDiffView={setFileDiffView}
            fetchGitState={fetchGitState}
            onCtrlL={handleCtrlL}
            onAltVersion={handleAltVersion}
            quickChatOpen={quickChatOpen}
            onCloseQuickChat={() => setQuickChatOpen(false)}
            llms={llms}
            webSearchAvailable={webSearchAvailable}
            disabledToolkits={disabledToolkits}
          />
        </Main>
      </TopBarProvider>

      <ArcTimeline open={arcsOpen} onClose={() => setArcsOpen(false)} />

      {altVersionSession && (
        <AlternativeVersionPanel
          session={altVersionSession}
          onClose={() => setAltVersionSession(null)}
          onGenerate={inlineGenerate}
        />
      )}
    </div>
  );
}

export default App;
