import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Panel, Group, Separator, usePanelRef } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
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
import { FileTreeOutliner } from "./components/outliner/FileTreeOutliner.tsx";
import { MarkdownFileEditor } from "./components/editor/MarkdownFileEditor.tsx";
import { SubprojectTypeDialog } from "./components/settings/SubprojectTypeDialog.tsx";
import { MetaPanel } from "./components/meta/MetaPanel.tsx";
import { ChatPanel } from "./components/chat/ChatPanel.tsx";
import { PanelSlot } from "./components/PanelSlot.tsx";
import { FieldEditorPanel } from "./components/editor/FieldEditorPanel.tsx";
import { CommandPalette } from "./components/git/CommandPalette.tsx";
import { GitCredentialsDialog } from "./components/git/GitCredentialsDialog.tsx";
import { FileHistoryModal } from "./components/git/FileHistoryModal.tsx";
import { ProjectSettingsModal } from "./components/settings/ProjectSettingsModal.tsx";
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
  projectApi,
  projectConfigApi,
  bookApi,
  llmApi,
  vectorApi,
  chatApi,
  gitApi,
  streamChat,
} from "./api.ts";

import { usePreferences } from "./hooks/usePreferences.ts";
import { AppearanceModal } from "./components/settings/AppearanceModal.tsx";
import { useProject } from "./hooks/useProject.ts";
import { useChapter } from "./hooks/useChapter.ts";
import { useChat } from "./hooks/useChat.ts";
import { useReferencedFiles } from "./hooks/useContext.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useWorkspaceMode } from "./hooks/useWorkspaceMode.ts";
import { useWorkspaceLevelConfigMap } from "./hooks/useWorkspaceLevelConfigMap.ts";
import { useOutlinerScope } from "./hooks/useOutlinerScope.ts";
import { useFileTabs } from "./hooks/useFileTabs.ts";
import { useGitState } from "./hooks/useGitState.ts";
import { useConversationActions } from "./hooks/useConversationActions.ts";
import { EditorTabs } from "./components/editor/EditorTabs.tsx";
import { SearchPanel } from "./components/editor/SearchPanel.tsx";
import { ArcTimeline } from "./components/arcs/ArcTimeline.tsx";
import { ContentBrowserOverlay } from "./components/outliner/ContentBrowserOverlay.tsx";
import { getAppBridge, isRunningInElectron } from "./electron/bridge.ts";
import { getMediaProjectPlugin } from "./mediaProjectRegistry.ts";
import { DefaultMediaProjectEditor } from "./media/DefaultMediaProjectEditor.tsx";
import { AlternativeVersionPanel } from "./components/editor/AlternativeVersionPanel.tsx";
import { QuickChatWindow } from "./components/chat/QuickChatWindow.tsx";
import { resolveDefaultModeId } from "./components/chat/effectiveChatModeForRequest.ts";
import { useConversationModel } from "./hooks/useConversationModel.ts";
import {
  loadInitialDisabledToolkits,
  saveDisabledToolkits,
  loadInitialRulesEnabled,
  saveRulesEnabled,
  loadLlmPrefs,
  saveLlmPrefs,
  loadMainPanelLayout,
  saveMainPanelLayout,
} from "./utils/chatStorage.ts";

function conversationHasVisibleMessages(conv: Conversation): boolean {
  return conv.messages.some((m) => !m.hidden);
}

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const { preferences, updatePreferences } = usePreferences();
  const chatFontSizePxRef = useRef(preferences.appearance.chatFontSizePx ?? 14);
  chatFontSizePxRef.current = preferences.appearance.chatFontSizePx ?? 14;
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
  const [disabledToolkits, setDisabledToolkits] = useState(
    loadInitialDisabledToolkits,
  );
  const [rulesEnabled, setRulesEnabled] = useState(loadInitialRulesEnabled);
  const [chatDownloadFeatureEnabled, setChatDownloadFeatureEnabled] =
    useState(false);

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

  const handleToggleReasoning = useCallback(
    () => setUseReasoning((v) => !v),
    [],
  );
  const handleReasoningEffortChange = useCallback(
    (effort: ReasoningEffort) => setReasoningEffort(effort),
    [],
  );
  const handleToggleToolkit = useCallback((kitId: string) => {
    setDisabledToolkits((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) {
        next.delete(kitId);
      } else {
        next.add(kitId);
      }
      return next;
    });
  }, []);
  const handleToggleRules = useCallback(() => setRulesEnabled((v) => !v), []);

  const handleLlmChange = useCallback(
    (id: string | undefined) => {
      setModeLlmId(id);
      if (id) {
        const llm = llms.find((l) => l.id === id);
        if (llm) {
          const hasReasoning = !!llm.reasoningModel;
          const hasFast = !!llm.fastModel;
          if (!hasReasoning) {
            setUseReasoning(false);
          } else if (!hasFast) {
            setUseReasoning(true);
          }
          // both available → keep current toggle state
        }
      } else {
        const mode = modes.find((m) => m.id === selectedMode);
        setUseReasoning(mode?.useReasoning ?? false);
      }
    },
    [llms, modes, selectedMode],
  );

  const reasoningAvailable = useMemo(() => {
    if (!modeLlmId) return true;
    const llm = llms.find((l) => l.id === modeLlmId);
    return !llm || !!llm.reasoningModel;
  }, [modeLlmId, llms]);

  const fastAvailable = useMemo(() => {
    if (!modeLlmId) return true;
    const llm = llms.find((l) => l.id === modeLlmId);
    return !llm || !!llm.fastModel;
  }, [modeLlmId, llms]);

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

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [workspaceModesRefreshNonce, setWorkspaceModesRefreshNonce] =
    useState(0);
  const [inlineChaptersNonce, setInlineChaptersNonce] = useState(0);
  const [subprojectDialog, setSubprojectDialog] = useState<{
    path: string;
    initialType?: string | null;
  } | null>(null);
  const outlinerScope = useOutlinerScope(
    project.projectPath ? project.projectPath : null,
  );

  // Ctrl+L: capture editor selection for chat
  const [activeSelection, setActiveSelection] =
    useState<SelectionContext | null>(null);
  const activeSelectionReplaceFnRef = useRef<
    ((from: number, to: number, text: string) => void) | null
  >(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  // Ctrl+Alt+A: alternative version panel
  const [altVersionSession, setAltVersionSession] =
    useState<AltVersionSession | null>(null);

  const farLeftPanelRef = usePanelRef();
  const leftPanelRef = usePanelRef();
  const centerPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const farRightPanelRef = usePanelRef();

  const mainPanelDefaultLayout = useMemo(() => loadMainPanelLayout(), []);

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

  const handleReplaceSelection = useCallback(
    (replacement: string, ctx: SelectionContext) => {
      if (!activeSelectionReplaceFnRef.current) return;
      activeSelectionReplaceFnRef.current(ctx.from, ctx.to, replacement);
      activeSelectionReplaceFnRef.current = null;
    },
    [],
  );

  const handleDismissSelection = useCallback(() => {
    setActiveSelection(null);
    activeSelectionReplaceFnRef.current = null;
  }, []);

  const clearActiveSelectionForChat = useCallback(() => {
    setActiveSelection(null);
  }, []);

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

  // Project root changes: reset structure and editor state
  useEffect(() => {
    if (!project.projectPath) return;
    chapter.setProjectPath(project.projectPath);
    chapter.closeChapter();
    void chapter.refreshChapters();
    setSelectedMeta(null);
    setMetaExpanded(false);
    setFocusedField(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  // Derive parent conversation for split-view (when the active chat is a thread)
  const parentConversationId =
    history.activeConversation?.parentConversationId ?? null;
  const parentConversation =
    history.conversations.find((c) => c.id === parentConversationId) ?? null;

  // Last visible message from parent chat (for thread context banner)
  const parentLastVisibleMessage = useMemo(() => {
    if (!history.activeConversation?.isThread) return null;
    const msgs = parentConversation?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (
        !msgs[i].hidden &&
        (msgs[i].role === "user" || msgs[i].role === "assistant")
      ) {
        return msgs[i];
      }
    }
    return null;
  }, [history.activeConversation?.isThread, parentConversation?.messages]);

  const [summarizingThread, setSummarizingThread] = useState(false);

  const handleSummarizeToParent = useCallback(
    async (focusInstructions?: string) => {
      const parentId = history.activeConversation?.parentConversationId;
      if (!parentId) return;
      const threadTitle = history.activeConversation?.title ?? "Thread";
      setSummarizingThread(true);
      try {
        const focusNorm =
          typeof focusInstructions === "string" &&
          focusInstructions.trim().length > 0
            ? focusInstructions.trim()
            : undefined;
        console.trace(
          `[App] summarizeToParent: parentId=${parentId}, focus=${focusNorm ? "yes" : "no (default)"}`,
        );
        const currentParentForSummary = history.conversations.find(
          (c) => c.id === parentId,
        );
        const { summary, title: generatedTitle } = await chatApi.summarizeThread(
          chat.messages,
          focusNorm,
          currentParentForSummary?.messages,
        );
        console.trace(
          `[App] summarizeToParent: received summary, length=${summary.length}, title="${generatedTitle}"`,
        );
        // Apply generated title to thread if the LLM returned one
        if (generatedTitle) {
          history.renameConversation(history.activeId, generatedTitle);
        }
        const summaryMessage = {
          role: "assistant" as const,
          content: summary,
          kind: "thread-summary" as const,
          threadSummaryMeta: {
            fromThreadId: history.activeId,
            fromThreadTitle: generatedTitle || threadTitle,
          },
        };
        history.summarizeThread(parentId, history.activeId, summaryMessage);
        // Switch to parent so the summary is immediately visible
        history.switchConversation(parentId);
      } catch (err) {
        console.error("[App] handleSummarizeToParent failed:", err);
        throw err;
      } finally {
        setSummarizingThread(false);
      }
    },
    [chat.messages, history],
  );

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

  const refreshChatDownloadFeature = useCallback(async () => {
    try {
      const status = await projectConfigApi.status();
      if (!status.initialized) {
        setChatDownloadFeatureEnabled(false);
        return;
      }
      const cfg = await projectConfigApi.get();
      setChatDownloadFeatureEnabled(cfg.extraFeatures?.chatDownload === true);
    } catch {
      setChatDownloadFeatureEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refreshChatDownloadFeature();
  }, [project.projectPath, refreshChatDownloadFeature]);

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
  const [metaExpanded, setMetaExpanded] = useState(false);
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
    handleGitRevert: handleGitRevertBase,
    credDialogOpen,
    setCredDialogOpen,
    pendingRetry,
    setPendingRetry,
    fileHistoryPath,
    setFileHistoryPath,
    showCredentialsDialog,
  } = git;
  const hasUncommitted = !gitStatus?.isClean;

  const handleGitRevert = useCallback(
    async (path: string, isDirectory: boolean) => {
      await handleGitRevertBase(path, isDirectory);
      setTreeRefreshKey((k) => k + 1);
    },
    [handleGitRevertBase],
  );

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

  const handleMainPanelLayoutChanged = useCallback((layout: Layout) => {
    saveMainPanelLayout(layout);
  }, []);

  // Outliner and chat moved out of the permanent UI (Ctrl+Shift+Space popup / Alt+2 /
  // Alt+4 instead) — force them collapsed on load regardless of a persisted layout.
  useLayoutEffect(() => {
    leftPanelRef.current?.collapse();
    rightPanelRef.current?.collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
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
        setQuickChatOpen((v) => !v);
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

      if (!e.altKey || e.shiftKey) return;

      const code = e.code;
      if (code === "Digit1" || code === "Numpad1") {
        e.preventDefault();
        const p = farLeftPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        return;
      }
      if (code === "Digit2" || code === "Numpad2") {
        e.preventDefault();
        const p = leftPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        return;
      }
      if (code === "Digit3" || code === "Numpad3") {
        e.preventDefault();
        const p = centerPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        return;
      }
      if (code === "Digit4" || code === "Numpad4") {
        e.preventDefault();
        const p = rightPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        return;
      }
      if (code === "Digit5" || code === "Numpad5") {
        e.preventDefault();
        const p = farRightPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panel refs stable; single global shortcut registration
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

  const handleOpenProject = useCallback(
    async (path: string) => {
      await project.openProject(path);
      await chapter.refreshChapters();
      loadModes();
    },
    [project, chapter, loadModes],
  );

  const workspaceModeId = chapter.activeSubprojectType ?? "default";
  const levelConfigByModeId = useWorkspaceLevelConfigMap(
    project.projectPath ?? null,
    workspaceModesRefreshNonce,
  );
  const {
    schema: workspaceModeSchema,
    metaSchemas: workspaceMetaSchemas,
    refresh: refreshWorkspaceModeSchema,
  } = useWorkspaceMode(project.projectPath ?? "", workspaceModeId);

  const proseEditorMode = chapter.activeChapter
    ? (workspaceModeSchema?.editorMode ?? "prose")
    : "standard";

  const fieldLabels = useMemo(() => {
    const schema = workspaceMetaSchemas?.["scene"];
    if (!schema) return {} as Record<string, string>;
    return Object.fromEntries(
      schema.fields.map((f) => [f.key, f.label]),
    ) as Record<string, string>;
  }, [workspaceMetaSchemas]);

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
    void refreshChatDownloadFeature();
    void refreshWorkspaceModeSchema();
  }, [loadModes, refreshChatDownloadFeature, refreshWorkspaceModeSchema]);

  const onWorkspacePluginsChanged = useCallback(() => {
    setWorkspaceModesRefreshNonce((n) => n + 1);
    void refreshWorkspaceModeSchema();
  }, [refreshWorkspaceModeSchema]);

  const mainChatComposerDraftRef = useRef("");

  useEffect(() => {
    mainChatComposerDraftRef.current = "";
  }, [history.activeId]);

  const conversation = useConversationModel({
    projectPath: project.projectPath,
    activeConversation: history.activeConversation,
    activeConversationId: history.activeId,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    reasoningEffort,
    disabledToolkits,
    rulesDisabled: !rulesEnabled,
    referencedFiles: refs.referencedFiles,
    focusedFieldKey: focusedField?.fieldKey,
    activeSelection,
    messages: chat.messages,
    pendingMessageRef: mainChatComposerDraftRef,
    chat,
    patchConversation: history.patchConversation,
    onActiveSelectionClear: clearActiveSelectionForChat,
    clearReferencedFiles: refs.clearFiles,
  });

  const handleComposerDraftChange = useCallback(
    (text: string) => {
      mainChatComposerDraftRef.current = text;
      conversation.schedulePreviewRefresh();
    },
    [conversation.schedulePreviewRefresh],
  );

  const {
    handleNewChat,
    handleDiscardCurrentChat,
    handleForkToNewConversation,
    handleStartThreadFromMessage,
  } = useConversationActions({
    history,
    chatMessages: chat.messages,
    selectedMode,
    modes,
    handleModeChange,
  });

  const handleSwitchChat = useCallback(
    (id: string) => {
      history.switchConversation(id);
    },
    [history],
  );

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
        onOpenFileDiff={handleOpenFileDiff}
      />

      <Group
        orientation="horizontal"
        className="app-panels"
        id="main-app-panels"
        defaultLayout={mainPanelDefaultLayout}
        onLayoutChanged={handleMainPanelLayoutChanged}
      >
        <Panel
          id="far-left"
          panelRef={farLeftPanelRef}
          defaultSize={0}
          minSize="15%"
          collapsible
          collapsedSize={0}
        >
          <PanelSlot
            storageKey="assistant-far-left-slot"
            defaultTool="threads"
            conversations={history.conversations}
            activeConversationId={history.activeId}
            onSwitchChat={handleSwitchChat}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="outliner"
          panelRef={leftPanelRef}
          defaultSize={0}
          minSize="10%"
          maxSize="50%"
          collapsible
          collapsedSize={0}
        >
          <div className="left-column">
            <div className={`outliner-slot${showMetaChrome ? " split" : ""}`}>
              <FileTreeOutliner
                projectPath={project.projectPath ?? null}
                selectedPath={fileEditor.selectedPath}
                onSelectFile={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  void fileEditor.openFile(path);
                }}
                onRevealInExplorer={() =>
                  projectApi.reveal().catch(console.error)
                }
                refreshNonce={treeRefreshKey}
                onTreeMutated={() => setTreeRefreshKey((k) => k + 1)}
                onFsChange={fileEditor.syncWithFilesystem}
                inlineChaptersRefreshNonce={inlineChaptersNonce}
                activeChapterId={chapter.activeChapter?.id ?? null}
                activeStructureRoot={chapter.structureRoot}
                editorPosition={chapter.editorPosition}
                levelConfigByModeId={levelConfigByModeId}
                onActivateSubprojectStructure={async (
                  subPath,
                  subType,
                  chapterId,
                  scroll,
                  selection,
                ) => {
                  chapter.setStructureRoot(subPath, subType);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  await chapter.openChapter(chapterId, scroll ?? null);
                  setSelectedMeta(selection);
                }}
                runSubprojectMutation={async (subPath, subType, fn) => {
                  chapter.setStructureRoot(subPath, subType);
                  await fn();
                }}
                onSubprojectStructureChanged={() =>
                  setInlineChaptersNonce((n) => n + 1)
                }
                onOpenBookMeta={async (subPath, subType) => {
                  chapter.setStructureRoot(subPath, subType);
                  const meta = await bookApi.getMeta(subPath);
                  setSelectedMeta({ type: "book", chapterId: "", meta });
                  setMetaExpanded(false);
                }}
                onCreateChapterInSubproject={async (
                  subPath,
                  subType,
                  title,
                ) => {
                  chapter.setStructureRoot(subPath, subType);
                  await chapter.createChapter(title);
                  setInlineChaptersNonce((n) => n + 1);
                }}
                onConfigureSubproject={(path, existingType) => {
                  setSubprojectDialog({
                    path,
                    initialType: existingType ?? undefined,
                  });
                }}
                scopeToPath={outlinerScope.scopePath}
                onClearOutlinerScope={outlinerScope.clearScopePath}
                onSetOutlinerScope={outlinerScope.setScopePath}
                onScopeInvalidated={outlinerScope.clearScopePath}
                gitStatus={gitStatus ?? undefined}
                onGitRevert={handleGitRevert}
                onShowFileHistory={setFileHistoryPath}
              />
            </div>

            {showMetaChrome && selectedMeta && (
              <div className="meta-panel-slot">
                <MetaPanel
                  selection={selectedMeta}
                  metaSchemas={workspaceMetaSchemas}
                  onSave={handleSaveMeta}
                  onClose={() => {
                    setSelectedMeta(null);
                    setMetaExpanded(false);
                    setFocusedField(null);
                  }}
                  onExpand={() => setMetaExpanded(true)}
                  onFocusField={handleOpenFieldEditor}
                  onOpenFile={(path) => void fileEditor.openFile(path)}
                />
              </div>
            )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="editor"
          panelRef={centerPanelRef}
          defaultSize="45%"
          minSize="15%"
          collapsible
          collapsedSize={0}
        >
          <div className="center-editor-pane">
            <EditorTabs
              tabs={fileEditor.tabs}
              activeTabPath={fileEditor.activeTabPath}
              onSelectTab={(path) => void fileEditor.openFile(path)}
              onCloseTab={fileEditor.closeTab}
              onCloseOtherTabs={fileEditor.closeOtherTabs}
              onCloseAllTabs={fileEditor.closeAllTabs}
            />
            {searchOpen && (
              <SearchPanel
                onOpenFile={(path, line) => {
                  void fileEditor.openFile(path, line);
                  setSearchOpen(false);
                }}
                onClose={() => setSearchOpen(false)}
              />
            )}
            {focusedField && showMetaChrome ? (
              <div className="field-editor-center">
                <FieldEditorPanel
                  fieldLabel={focusedField.fieldLabel}
                  sceneTitle={selectedMeta?.meta.title || undefined}
                  value={focusedField.value}
                  onSave={handleFieldEditorSave}
                  onClose={() => setFocusedField(null)}
                />
              </div>
            ) : metaExpanded && showMetaChrome ? (
              <div className="meta-panel-center">
                <MetaPanel
                  selection={selectedMeta!}
                  metaSchemas={workspaceMetaSchemas}
                  onSave={handleSaveMeta}
                  onClose={() => setMetaExpanded(false)}
                  expanded={true}
                  onFocusField={handleOpenFieldEditor}
                  onOpenFile={(path) => void fileEditor.openFile(path)}
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
                onSave={() => {
                  void fileEditor.save();
                  fetchGitState();
                }}
                onClearError={fileEditor.clearError}
                onCloseFile={() => {
                  setFileDiffView(null);
                  fileEditor.closeFile();
                }}
                onCtrlL={handleCtrlL}
                onAltVersion={handleAltVersion}
                scrollToLine={fileEditor.pendingScroll?.line}
                scrollNonce={fileEditor.pendingScroll?.nonce}
                onScrollHandled={fileEditor.clearPendingScroll}
                diffOriginal={
                  fileDiffView && fileDiffView.path === fileEditor.selectedPath
                    ? fileDiffView.content
                    : null
                }
                diffLabel={fileDiffView?.label}
                onExitDiff={() => setFileDiffView(null)}
              />
            ) : (
              <MediaProjectEditor
                editorMode={proseEditorMode}
                proseLeafAtScene={
                  workspaceModeSchema?.proseLeafLevel === "scene"
                }
                chapter={chapter.activeChapter}
                structureRoot={chapter.structureRoot}
                actionContents={chapter.actionContents}
                scrollTarget={chapter.scrollTarget}
                hasDirtyActions={chapter.hasDirtyActions}
                onActionChange={chapter.updateActionContent}
                onActionSave={chapter.saveAction}
                onSaveAll={() => {
                  chapter.saveAllDirty();
                  fetchGitState();
                }}
                onClose={chapter.closeChapter}
                onScrollTargetConsumed={chapter.clearScrollTarget}
                onEditorFocus={chapter.updateEditorPosition}
                onCtrlL={handleCtrlL}
                onAltVersion={handleAltVersion}
              />
            )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="chat"
          panelRef={rightPanelRef}
          defaultSize={0}
          minSize="15%"
          collapsible
          collapsedSize={0}
        >
          <div className="chat-column">
            <div className="chat-column-main">
              <ChatPanel
                messages={conversation.messages}
                streaming={conversation.streaming}
                error={conversation.error}
                toolActivity={conversation.toolActivity}
                theme={
                  preferences.appearance.theme === "light" ? "light" : "dark"
                }
                modes={modes}
                selectedMode={selectedMode}
                referencedFiles={refs.referencedFiles}
                conversations={history.conversations}
                activeConversationId={history.activeId}
                useReasoning={useReasoning}
                onToggleReasoning={handleToggleReasoning}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                disabledToolkits={disabledToolkits}
                onToggleToolkit={handleToggleToolkit}
                rulesEnabled={rulesEnabled}
                onToggleRules={handleToggleRules}
                reasoningAvailable={reasoningAvailable}
                fastAvailable={fastAvailable}
                onModeChange={handleModeChange}
                llms={llms}
                selectedLlmId={modeLlmId}
                onLlmChange={handleLlmChange}
                onSend={conversation.send}
                onStop={conversation.stopStreaming}
                onRetry={conversation.retry}
                onAddFile={refs.addFile}
                onRemoveFile={refs.removeFile}
                onForkFromMessage={conversation.forkFromMessage}
                onForkToNewConversation={handleForkToNewConversation}
                onStartThreadFromMessage={handleStartThreadFromMessage}
                onEditMessage={conversation.editMessage}
                onDeleteMessages={conversation.deleteMessages}
                onSetMessageFeedback={conversation.setMessageFeedback}
                onNewChat={handleNewChat}
                onDiscardCurrentChat={handleDiscardCurrentChat}
                activeIsThread={history.activeConversation?.isThread === true}
                onSwitchChat={handleSwitchChat}
                onDeleteChat={history.deleteConversation}
                onRenameChat={history.renameConversation}
                onToggleSavedToProject={history.toggleSavedToProject}
                onClearAllBrowserChats={history.clearAllBrowserChats}
                clearAllBrowserChatsDisabled={
                  !project.projectPath || !history.hydrated
                }
                chatDownloadEnabled={chatDownloadFeatureEnabled}
                onOpenArcs={() => setArcsOpen(true)}
                structureRoot={chapter.structureRoot}
                activeSelection={activeSelection}
                onDismissSelection={handleDismissSelection}
                onReplaceSelection={handleReplaceSelection}
                onApplyFieldUpdate={handleApplyFieldUpdate}
                fieldLabels={fieldLabels}
                chatFocusTriggerRef={chatFocusTriggerRef}
                onFileChanged={(path) => {
                  if (fileEditor.selectedPath === path) {
                    void fileEditor.openFile(path);
                  }
                  setTreeRefreshKey((k) => k + 1);
                }}
                writeFileSettled={history.activeConversation?.writeFileSettled}
                onSettleSnapshots={(patch) => {
                  history.settleWriteFileSnapshots(history.activeId, patch);
                }}
                onComposerDraftChange={handleComposerDraftChange}
                onSummarizeToParent={handleSummarizeToParent}
                isSummarizing={summarizingThread}
                contextInfo={conversation.contextInfo}
                activeFile={activeChapterTitle}
                isDirty={chapter.hasDirtyActions}
                systemPromptPreview={conversation.systemPrompt}
                onFetchContextBlocks={conversation.fetchContextBlocks}
                parentLastMessage={parentLastVisibleMessage}
              />
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="far-right"
          panelRef={farRightPanelRef}
          defaultSize={0}
          minSize="15%"
          collapsible
          collapsedSize={0}
        >
          <PanelSlot
            storageKey="assistant-far-right-slot"
            defaultTool="plans"
            conversations={history.conversations}
            activeConversationId={history.activeId}
            onSwitchChat={handleSwitchChat}
          />
        </Panel>
      </Group>

      <ArcTimeline open={arcsOpen} onClose={() => setArcsOpen(false)} />
      <ContentBrowserOverlay
        open={contentBrowserOpen}
        projectPath={project.projectPath ?? null}
        onClose={() => setContentBrowserOpen(false)}
        onSelectFile={(path) => {
          chapter.closeChapter();
          setSelectedMeta(null);
          setMetaExpanded(false);
          setFocusedField(null);
          void fileEditor.openFile(path);
        }}
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

      {fileHistoryPath && (
        <FileHistoryModal
          filePath={fileHistoryPath}
          onClose={() => setFileHistoryPath(null)}
          onOpenDiff={handleOpenFileDiff}
        />
      )}

      {altVersionSession && (
        <AlternativeVersionPanel
          session={altVersionSession}
          onClose={() => setAltVersionSession(null)}
          onGenerate={inlineGenerate}
        />
      )}

      {appearanceOpen && (
        <AppearanceModal
          preferences={preferences}
          onUpdate={updatePreferences}
          onClose={() => setAppearanceOpen(false)}
        />
      )}

      <QuickChatWindow
        open={quickChatOpen}
        onClose={() => setQuickChatOpen(false)}
        llms={llms}
        webSearchAvailable={webSearchAvailable}
        disabledToolkits={disabledToolkits}
      />

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleImportChatFile}
      />
    </div>
  );
}

export default App;
