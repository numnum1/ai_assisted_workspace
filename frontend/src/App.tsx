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
  Maximize2,
  Minimize2,
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
import { SimulationSetupModal, type SimulationSetupResult } from "./components/simulation/SimulationSetupModal.tsx";
import { PanelSlot } from "./components/PanelSlot.tsx";
import { FieldEditorPanel } from "./components/editor/FieldEditorPanel.tsx";
import { PromptPackModal } from "./components/chat/PromptPackModal.tsx";
import { CommandPalette } from "./components/git/CommandPalette.tsx";
import { GitCredentialsDialog } from "./components/git/GitCredentialsDialog.tsx";
import { FileHistoryModal } from "./components/git/FileHistoryModal.tsx";
import { ProjectSettingsModal } from "./components/settings/ProjectSettingsModal.tsx";
import type { CommandAction } from "./components/git/CommandPalette.tsx";
import type {
  AgentPreset,
  Mode,
  Conversation,
  GitStatus,
  GitSyncStatus,
  MetaSelection,
  MetaNodeType,
  NodeMeta,
  SelectionContext,
  AltVersionSession,
  LlmPublic,
  ChatSessionKind,
} from "./types.ts";
import type { NewChatConfirmPayload } from "./components/chat/NewChatDialog.tsx";
import { CHAT_TOOLKIT_IDS } from "./types.ts";
import {
  modesApi,
  gitApi,
  projectApi,
  projectConfigApi,
  bookApi,
  llmApi,
  vectorApi,
  AuthRequiredError,
  chatApi,
} from "./api.ts";
import { buildThreadHiddenBootstrap } from "./components/chat/chatThreadUtils.ts";
import type { GuidedThreadOfferPayload } from "./components/chat/guidedThreadOfferUtils.ts";
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
import { EditorTabs } from "./components/editor/EditorTabs.tsx";
import { SearchPanel } from "./components/editor/SearchPanel.tsx";
import { getAppBridge, isRunningInElectron } from "./electron/bridge.ts";
import { getMediaProjectPlugin } from "./mediaProjectRegistry.ts";
import { DefaultMediaProjectEditor } from "./media/DefaultMediaProjectEditor.tsx";
import { AlternativeVersionPanel } from "./components/editor/AlternativeVersionPanel.tsx";
import { QuickChatWindow } from "./components/chat/QuickChatWindow.tsx";
import {
  ensureSteeringPlanMarkedComplete,
  parseSteeringPlanFromAssistant,
} from "./components/chat/planFenceUtils.ts";
import {
  agentExecutionPartialFromParent,
  applyGuidedAgentFromNewChatDialog,
  buildGuidedAgentPatchFromPreset,
  buildNaviConversationPatch,
  buildAgentExecutionPatchFromGlobals,
  conversationHasAgentExecution,
  getEffectiveChatExecution,
  guidedPresetPartialFromParent,
  isNewChatConfirmPayload,
  threadExecutionOverrideFromPreset,
} from "./components/chat/chatAgentUtils.ts";
import {
  nonPromptModes,
  resolvePersistedChatModeId,
  effectiveChatModeIdForRequest,
} from "./components/chat/effectiveChatModeForRequest.ts";
import {
  GUIDED_AGENT_KICKOFF_USER_MESSAGE,
  GUIDED_SIMPLE_KICKOFF_USER_MESSAGE,
  cancelGuidedAgentKickoffIfPendingMismatchesActive,
  clearPendingGuidedAgentKickoff,
  hasPendingGuidedAgentKickoffFor,
  scheduleGuidedAgentPresetKickoff,
  tryMarkGuidedAgentKickoffStarted,
} from "./components/chat/guidedAgentKickoff.ts";
import { hasThreadResultFence, parseThreadResult } from "./components/chat/threadResultUtils.ts";
import {
  PARENT_RESULT_INTEGRATION_USER_MESSAGE,
  consumeNextPendingKickoffFor,
  hasPendingParentResultKickoffFor,
  scheduleParentResultKickoff,
  tryMarkKickoffStarted,
} from "./components/chat/parentResultKickoffState.ts";
import {
  cancelNaviGreetingKickoffIfMismatch,
  hasPendingNaviGreetingKickoffFor,
  scheduleNaviGreetingKickoff,
  tryMarkNaviGreetingKickoffStarted,
} from "./components/chat/naviGreetingKickoff.ts";
import {
  scheduleSimulationReply,
  hasPendingSimulationReply,
  tryStartSimulationReply,
  finishSimulationReply,
  clearSimulationReply,
} from "./components/chat/simulationReplyKickoff.ts";
import { useConversationModel } from "./hooks/useConversationModel.ts";

/** Safety cap on simulated-merchant turns so a looping Navi state cannot run forever. */
const SIMULATION_MAX_TURNS = 12;

/** Modes shown in the main chat mode menu and as project default (excludes agent-only). */
function standardChatModes(mds: Mode[]): Mode[] {
  return nonPromptModes(mds).filter((m) => !m.agentOnly);
}

function resolveDefaultModeId(
  mds: Mode[],
  configured: string | undefined,
): string {
  const id = configured?.trim() ?? "";
  if (id && mds.some((m) => m.id === id)) return id;
  if (mds.some((m) => m.id === "review")) return "review";
  if (mds.length > 0) return mds[0].id;
  return "review";
}

function conversationHasVisibleMessages(conv: Conversation): boolean {
  return conv.messages.some((m) => !m.hidden);
}

const LLM_PREFS_KEY = "chat-llm-prefs";
const CHAT_DISABLED_TOOLKITS_KEY = "chat-disabled-toolkits";
const CHAT_RULES_ENABLED_KEY = "chat-rules-enabled";

function loadInitialDisabledToolkits(): Set<string> {
  try {
    const raw = localStorage.getItem(CHAT_DISABLED_TOOLKITS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === "string"));
      }
    }
    if (localStorage.getItem("chat-tools-disabled") === "true") {
      localStorage.removeItem("chat-tools-disabled");
      return new Set(CHAT_TOOLKIT_IDS);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDisabledToolkits(s: Set<string>) {
  try {
    localStorage.setItem(CHAT_DISABLED_TOOLKITS_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function loadInitialRulesEnabled(): boolean {
  try {
    const raw = localStorage.getItem(CHAT_RULES_ENABLED_KEY);
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return true;
}

function saveRulesEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CHAT_RULES_ENABLED_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

function loadLlmPrefs(): {
  llmId: string | null;
  useReasoning: boolean;
} | null {
  try {
    const raw = localStorage.getItem(LLM_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      llmId: string | null;
      useReasoning: boolean;
      useWebSearch?: boolean;
    };
    return { llmId: parsed.llmId, useReasoning: parsed.useReasoning };
  } catch {
    return null;
  }
}

function saveLlmPrefs(llmId: string | undefined, useReasoning: boolean) {
  try {
    localStorage.setItem(
      LLM_PREFS_KEY,
      JSON.stringify({ llmId: llmId ?? null, useReasoning }),
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

const MAIN_PANEL_LAYOUT_KEY = "assistant-main-panel-layout";
const MAIN_PANEL_IDS = ["far-left", "outliner", "editor", "chat", "far-right"] as const;

function loadMainPanelLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(MAIN_PANEL_LAYOUT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    const rec = parsed as Record<string, unknown>;
    const layout: Layout = {};
    for (const id of MAIN_PANEL_IDS) {
      const v = rec[id];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        return undefined;
      layout[id] = v;
    }
    const sum = MAIN_PANEL_IDS.reduce((acc, id) => acc + layout[id], 0);
    if (sum < 99 || sum > 101) return undefined;
    return layout;
  } catch {
    return undefined;
  }
}

function saveMainPanelLayout(layout: Layout) {
  try {
    const payload: Layout = {};
    for (const id of MAIN_PANEL_IDS) {
      const v = layout[id];
      if (typeof v !== "number" || !Number.isFinite(v)) return;
      payload[id] = v;
    }
    localStorage.setItem(MAIN_PANEL_LAYOUT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Compare disabled toolkit ids regardless of order or Set vs array (avoids update loops on new references). */
function disabledToolkitsSignature(
  ids: ReadonlySet<string> | readonly string[] | undefined | null,
): string {
  if (!ids) return "";
  const list = [...ids];
  if (list.length === 0) return "";
  return [...list].sort().join("\0");
}

function disabledToolkitSetMatchesArray(
  s: ReadonlySet<string>,
  arr: readonly string[] | undefined,
): boolean {
  return disabledToolkitsSignature(s) === disabledToolkitsSignature(arr);
}

function agentExecutionMatchesGlobals(
  conv: Conversation,
  globals: {
    llmId: string | undefined;
    useReasoning: boolean;
    disabledToolkits: ReadonlySet<string>;
  },
): boolean {
  const patch = buildAgentExecutionPatchFromGlobals(globals);
  return (
    conv.agentLlmId === patch.agentLlmId &&
    conv.agentUseReasoning === patch.agentUseReasoning &&
    disabledToolkitsSignature(conv.agentDisabledToolkits) ===
      disabledToolkitsSignature(patch.agentDisabledToolkits)
  );
}

/** Fingerprint persisted agent fields so we can tell when the conversation (not the toolbar) changed. */
function agentPersistSignature(conv: Conversation): string {
  if (!conversationHasAgentExecution(conv)) return "";
  return [
    conv.agentLlmId ?? "∅",
    conv.agentUseReasoning === undefined ? "∅" : String(conv.agentUseReasoning),
    disabledToolkitsSignature(conv.agentDisabledToolkits),
  ].join("|");
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
  const [agentPresets, setAgentPresets] = useState<AgentPreset[]>([]);
  const [simulationSetupOpen, setSimulationSetupOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState("review");
  const [useReasoning, setUseReasoning] = useState(false);
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
  /** Configured mode/LLM for Navi sessions (project settings → Navi tab). */
  const naviConfigRef = useRef<{ modeId?: string; llmId?: string }>({});
  /**
   * Ref-mirrors of toolbar state so the conv-sync effect can read current values without
   * listing them as reactive deps — which would cause snap-back any time the user changes
   * mode, LLM, or reasoning (handleModeChange sets all three at once).
   */
  const selectedModeRef = useRef(selectedMode);
  selectedModeRef.current = selectedMode;
  const modeLlmIdRef = useRef(modeLlmId);
  modeLlmIdRef.current = modeLlmId;
  const useReasoningRef = useRef(useReasoning);
  useReasoningRef.current = useReasoning;
  const disabledToolkitsRef = useRef(disabledToolkits);
  disabledToolkitsRef.current = disabledToolkits;
  /** Avoid toolbar ↔ conversation ping-pong: only pull agent fields from conv when conv or active chat actually changed. */
  const prevModeSyncActiveIdRef = useRef<string | null>(null);
  const prevAgentPersistSigRef = useRef("");
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
    const { llmId, useReasoning: savedReasoning } = prefs;
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
  const chat = useChat(history.updateMessages, {
    onNaviStateTransition: (stateId, conversationId, completedStateId, summary) => {
      const patch: Partial<import("./types.ts").Conversation> = { naviStateId: stateId };
      if (completedStateId && summary) {
        const conv = history.conversations.find((c) => c.id === conversationId);
        patch.naviResults = { ...(conv?.naviResults ?? {}), [completedStateId]: summary };
      }
      history.patchConversation(conversationId, patch);
    },
    onNaviPlan: (plan, conversationId) => {
      history.patchConversation(conversationId, { naviPlan: plan });
    },
    onNaviTipsCovered: (coveredIds, conversationId) => {
      const conv = history.conversations.find((c) => c.id === conversationId);
      const existing = conv?.naviCoveredTips ?? [];
      const merged = [...new Set([...existing, ...coveredIds])];
      history.patchConversation(conversationId, { naviCoveredTips: merged });
    },
    onNaviProblems: (current, queue, conversationId) => {
      history.patchConversation(conversationId, { naviCurrentProblem: current, naviProblemQueue: queue, naviPlan: null });
    },
    onAssistantResponseComplete: (fullText, meta) => {
      // Simulation auto-runner: after Navi finished a turn in a simulation,
      // queue the next simulated-merchant reply (the effect below sends it).
      if (meta.sessionKind === "navi") {
        const conv = history.conversations.find(
          (c) => c.id === meta.conversationId,
        );
        if (conv?.simulationConfig) {
          scheduleSimulationReply(meta.conversationId);
        }
        return;
      }

      if (meta.sessionKind !== "guided") return;

      const parsed = parseSteeringPlanFromAssistant(fullText);
      if (parsed) {
        history.patchConversation(meta.conversationId, {
          steeringPlan: parsed,
        });
      }

      if (hasThreadResultFence(fullText)) {
        const result = parseThreadResult(fullText);
        if (result) {
          const thisConv = history.conversations.find(
            (c) => c.id === meta.conversationId,
          );
          const parentId = thisConv?.parentConversationId;
          if (parentId) {
            const displayTitle =
              result.threadTitle ?? thisConv?.title ?? "Thread";
            history.appendMessageToConversation(parentId, {
              role: "assistant",
              content: `**Thread-Ergebnis (${displayTitle}):**\n\n${result.summary}`,
              hidden: true,
              turnId: crypto.randomUUID(),
            });
            scheduleParentResultKickoff({
              parentConversationId: parentId,
              threadTitle: displayTitle,
            });
            if (history.activeId !== parentId) {
              history.switchConversation(parentId);
            }
          }
        }
      }
    },
  });

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
      const forDefault = standardChatModes(mds);
      let configured: string | undefined;
      let agents: AgentPreset[] = [];
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
          naviConfigRef.current = {
            modeId: cfg.naviModeId,
            llmId: cfg.naviLlmId,
          };
        } catch {
          /* ignore */
        }
        try {
          agents = await projectConfigApi.listAgents();
        } catch {
          /* ignore */
        }
      }
      setAgentPresets(agents);
      if (configured === "prompt-pack") configured = undefined;
      if (configured) {
        const cfgMode = mds.find((m) => m.id === configured);
        if (cfgMode?.agentOnly) configured = undefined;
      }
      const resolvedId = resolveDefaultModeId(forDefault, configured);
      projectDefaultChatModeIdRef.current = resolvedId;
      const resolvedMode = forDefault.find((m) => m.id === resolvedId);
      setSelectedMode(resolvedId);
      setUseReasoning(resolvedMode?.useReasoning ?? false);
      setModeLlmId(resolvedMode?.llmId ?? undefined);
    } catch (e) {
      console.error(e);
      setAgentPresets([]);
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
    const nonPrompt = nonPromptModes(modes);
    const standardSel = standardChatModes(modes);
    const conv = history.activeConversation;
    const sessionKind = conv.sessionKind ?? "standard";
    const allowedForSession =
      sessionKind === "guided" || sessionKind === "navi" ? nonPrompt : standardSel;
    let desired: string;
    /** Threads (and similar) can have only hidden bootstrap messages — still use conv.mode / history, not project default. */
    /** Guided/navi/agent chats keep {@link Conversation.mode} (preset) until the user sends — do not snap toolbar to project default. */
    const trulyEmptyForModeSync =
      sessionKind !== "guided" &&
      sessionKind !== "navi" &&
      !conversationHasVisibleMessages(conv) &&
      conv.messages.length === 0;
    if (trulyEmptyForModeSync) {
      desired = projectDefaultChatModeIdRef.current;
      if (!standardSel.some((m) => m.id === desired)) {
        desired = resolveDefaultModeId(standardSel, undefined);
      }
    } else {
      const fromConv = resolvePersistedChatModeId(conv, nonPrompt, modes);
      desired = fromConv ?? projectDefaultChatModeIdRef.current;
      if (!allowedForSession.some((m) => m.id === desired)) {
        desired = resolveDefaultModeId(allowedForSession, undefined);
      }
    }
    // Only apply mode row when the resolved id differs; otherwise handleModeChange would still
    // rewrite llm/reasoning from the mode and fight the agent / prefs block below → update depth loops.
    // Read via ref so that a manual user mode-change does not re-trigger this effect and snap back.
    if (desired !== selectedModeRef.current) {
      handleModeChange(desired, modes);
    }
    const convAfter = history.activeConversation;

    const activeIdNow = history.activeId;
    const switchedConv = prevModeSyncActiveIdRef.current !== activeIdNow;
    prevModeSyncActiveIdRef.current = activeIdNow;

    const apSig = agentPersistSignature(convAfter);
    const agentPersistChanged = prevAgentPersistSigRef.current !== apSig;
    prevAgentPersistSigRef.current = apSig;

    if (conversationHasAgentExecution(convAfter)) {
      lastNonAgentToolbarPrefsSyncRef.current = null;
      const pullAgentFromConv = switchedConv || agentPersistChanged;

      if (pullAgentFromConv) {
        let gLlm: string | undefined = modeLlmIdRef.current;
        let gReason = useReasoningRef.current;
        let gDisabled: ReadonlySet<string> = disabledToolkitsRef.current;
        if (convAfter.agentLlmId !== undefined) gLlm = convAfter.agentLlmId;
        if (convAfter.agentUseReasoning !== undefined)
          gReason = convAfter.agentUseReasoning;
        if (convAfter.agentDisabledToolkits !== undefined) {
          gDisabled = new Set(convAfter.agentDisabledToolkits);
        }
        setModeLlmId((prev) => (prev === gLlm ? prev : gLlm));
        setUseReasoning((prev) => (prev === gReason ? prev : gReason));
        if (convAfter.agentDisabledToolkits !== undefined) {
          setDisabledToolkits((prev) => {
            if (
              disabledToolkitSetMatchesArray(
                prev,
                convAfter.agentDisabledToolkits,
              )
            )
              return prev;
            return new Set(convAfter.agentDisabledToolkits);
          });
        }
        const target = {
          llmId: gLlm,
          useReasoning: gReason,
          disabledToolkits: gDisabled,
        };
        if (!agentExecutionMatchesGlobals(convAfter, target)) {
          history.patchConversation(
            convAfter.id,
            buildAgentExecutionPatchFromGlobals(target),
          );
        }
      } else {
        const globals = {
          llmId: modeLlmIdRef.current,
          useReasoning: useReasoningRef.current,
          disabledToolkits: disabledToolkitsRef.current,
        };
        if (!agentExecutionMatchesGlobals(convAfter, globals)) {
          history.patchConversation(
            convAfter.id,
            buildAgentExecutionPatchFromGlobals(globals),
          );
        }
      }
    } else if (prefsHydratedRef.current) {
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
    history.patchConversation,
    history.activeConversation.mode,
    history.activeConversation.sessionKind,
    history.activeConversation.agentLlmId,
    history.activeConversation.agentUseReasoning,
    disabledToolkitsSignature(history.activeConversation.agentDisabledToolkits),
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
    saveLlmPrefs(modeLlmId, useReasoning);
  }, [modeLlmId, useReasoning]);

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
  const [promptPackOpen, setPromptPackOpen] = useState(false);

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
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null);
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

  const handleGitRevert = useCallback(
    async (path: string, isDirectory: boolean) => {
      const label = isDirectory ? `Ordner „${path}“` : `Datei „${path}“`;
      if (
        !window.confirm(
          `Alle Änderungen in ${label} wirklich verwerfen?\nDieser Vorgang kann nicht rückgängig gemacht werden.`,
        )
      ) {
        return;
      }
      try {
        if (isDirectory) {
          await gitApi.revertDirectory(path);
        } else {
          const isUntracked = gitStatus?.untracked?.includes(path) ?? false;
          await gitApi.revertFile(path, isUntracked);
        }
        setTreeRefreshKey((k) => k + 1);
        await fetchGitState();
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : "Revert fehlgeschlagen",
        );
      }
    },
    [gitStatus, fetchGitState],
  );

  useEffect(() => {
    void fetchGitState();
    const interval = setInterval(
      () => {
        void fetchGitState();
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [fetchGitState, project.projectPath]);

  useEffect(() => {
    if (paletteOpen) {
      void fetchGitState();
    }
  }, [paletteOpen, fetchGitState]);

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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const [centerPaneWide, setCenterPaneWide] = useState(false);

  const handleMainPanelLayoutChanged = useCallback((layout: Layout) => {
    saveMainPanelLayout(layout);
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (left && right)
      setCenterPaneWide(left.isCollapsed() && right.isCollapsed());
  }, []);

  useLayoutEffect(() => {
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (left && right)
      setCenterPaneWide(left.isCollapsed() && right.isCollapsed());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync once after persisted layout applies
  }, []);

  useEffect(() => {
    const syncSidebarsWideState = () => {
      const left = leftPanelRef.current;
      const right = rightPanelRef.current;
      if (left && right)
        setCenterPaneWide(left.isCollapsed() && right.isCollapsed());
    };

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
        syncSidebarsWideState();
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
        syncSidebarsWideState();
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

  const handleToggleCenterPanels = useCallback(() => {
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (!left || !right) return;
    if (left.isCollapsed() && right.isCollapsed()) {
      left.expand();
      right.expand();
      setCenterPaneWide(false);
    } else {
      left.collapse();
      right.collapse();
      setCenterPaneWide(true);
    }
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
    ];
    return actions;
  }, [hasUncommitted, syncBadge]);

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

  const performGuidedAgentPresetKickoff = useCallback(
    (conv: Conversation) => {
      const modeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
      const mode = modes.find((m) => m.id === modeId);
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      const streamSession = {
        conversationId: conv.id,
        sessionKind: "guided" as ChatSessionKind,
        steeringPlan: conv.steeringPlan,
        isThread: conv.isThread ?? false,
      };
      // Mit Steuerungsplan → detaillierte Kickoff-Nachricht; ohne → einfache Begrüßung.
      const kickoffMessage = conv.steeringPlan?.trim()
        ? GUIDED_AGENT_KICKOFF_USER_MESSAGE
        : GUIDED_SIMPLE_KICKOFF_USER_MESSAGE;
      chat.sendMessage(
        kickoffMessage,
        modeId,
        refs.referencedFiles,
        mode?.name,
        mode?.color,
        exec.useReasoning,
        exec.llmId,
        undefined,
        focusedField?.fieldKey ?? null,
        exec.disabledToolkits,
        streamSession,
        { userHidden: true, ...(!rulesEnabled ? { rulesDisabled: true } : {}) },
      );
      history.patchConversation(conv.id, { mode: modeId });
      setActiveSelection(null);
    },
    [
      chat.sendMessage,
      selectedMode,
      modes,
      refs.referencedFiles,
      useReasoning,
      modeLlmId,
      focusedField,
      disabledToolkits,
      rulesEnabled,
      history.patchConversation,
    ],
  );

  const performParentResultKickoff = useCallback(
    (parentConv: Conversation) => {
      const modeId = effectiveChatModeIdForRequest(parentConv, selectedMode, modes);
      const mode = modes.find((m) => m.id === modeId);
      const exec = getEffectiveChatExecution(parentConv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      const streamSession = {
        conversationId: parentConv.id,
        sessionKind: "guided" as ChatSessionKind,
        steeringPlan: parentConv.steeringPlan,
        // isThread intentionally not set — parent is a root conversation
      };
      chat.sendMessage(
        PARENT_RESULT_INTEGRATION_USER_MESSAGE,
        modeId,
        [],
        mode?.name,
        mode?.color,
        exec.useReasoning,
        exec.llmId,
        undefined,
        focusedField?.fieldKey ?? null,
        exec.disabledToolkits,
        streamSession,
        { userHidden: true, ...(!rulesEnabled ? { rulesDisabled: true } : {}) },
      );
      history.patchConversation(parentConv.id, { mode: modeId });
    },
    [
      chat.sendMessage,
      selectedMode,
      modes,
      useReasoning,
      modeLlmId,
      focusedField,
      disabledToolkits,
      rulesEnabled,
      history.patchConversation,
    ],
  );

  // Guided agent preset with initial plan: auto-send hidden bootstrap so the assistant speaks first.
  useEffect(() => {
    const conv = history.activeConversation;
    if (!conv) return;

    cancelGuidedAgentKickoffIfPendingMismatchesActive(conv.id);

    if (!hasPendingGuidedAgentKickoffFor(conv.id)) return;
    if (conv.sessionKind !== "guided") return;
    if (conv.messages.length > 0) return;
    // Wait until loadMessages has applied this conversation (avoid sendMessage using a stale message list).
    if (chat.messages.length !== conv.messages.length) return;
    if (chat.streaming) return;

    if (!tryMarkGuidedAgentKickoffStarted(conv.id)) {
      clearPendingGuidedAgentKickoff();
      return;
    }

    clearPendingGuidedAgentKickoff();
    performGuidedAgentPresetKickoff(conv);
  }, [
    history.activeConversation,
    chat.messages,
    chat.streaming,
    performGuidedAgentPresetKickoff,
  ]);

  // Navi session: trigger greeting call when a new navi conversation has no messages yet.
  useEffect(() => {
    const conv = history.activeConversation;
    if (!conv) return;
    cancelNaviGreetingKickoffIfMismatch(conv.id);
    if (!hasPendingNaviGreetingKickoffFor(conv.id)) return;
    if (conv.sessionKind !== "navi") return;
    if (conv.messages.length > 0) return;
    if (chat.messages.length !== conv.messages.length) return;
    if (chat.streaming) return;
    if (!tryMarkNaviGreetingKickoffStarted(conv.id)) return;

    const modeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
    const mode = modes.find((m) => m.id === modeId);
    const exec = getEffectiveChatExecution(conv, {
      llmId: modeLlmId,
      useReasoning,
      disabledToolkits,
    });
    chat.sendMessage(
      "",
      modeId,
      [],
      mode?.name,
      mode?.color,
      exec.useReasoning,
      exec.llmId,
      undefined,
      null,
      exec.disabledToolkits,
      {
        conversationId: conv.id,
        sessionKind: "navi",
        naviStateId: conv.naviStateId ?? "greeting",
        naviResults: conv.naviResults,
        naviPlan: conv.naviPlan,
        naviCoveredTips: conv.naviCoveredTips,
        naviCurrentProblem: conv.naviCurrentProblem,
        naviProblemQueue: conv.naviProblemQueue,
      },
      { userHidden: true, rulesDisabled: !rulesEnabled },
    );
  }, [
    history.activeConversation,
    chat.messages,
    chat.streaming,
    chat.sendMessage,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    rulesEnabled,
  ]);

  // Simulation runner: generate the next simulated-merchant reply and send it to Navi.
  const performSimulationReply = useCallback(
    async (conv: Conversation) => {
      const sim = conv.simulationConfig;
      if (!sim) {
        finishSimulationReply(conv.id);
        return;
      }
      const bridge = getAppBridge();
      try {
        const transcript = conv.messages
          .filter(
            (m) =>
              !m.hidden &&
              (m.role === "user" || m.role === "assistant") &&
              m.content.trim().length > 0,
          )
          .map((m) => ({
            speaker: (m.role === "assistant" ? "navi" : "merchant") as
              | "navi"
              | "merchant",
            content: m.content,
          }));

        const modeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
        const mode = modes.find((m) => m.id === modeId);
        const exec = getEffectiveChatExecution(conv, {
          llmId: modeLlmId,
          useReasoning,
          disabledToolkits,
        });

        // The persona description (if any) drives the simulated user; goal is a fallback.
        const personaText = sim.personaPrompt?.trim() || sim.goal;
        const result = await bridge?.simulation?.generateUserReply?.({
          goal: personaText,
          characterNames: sim.personaName
            ? [sim.personaName]
            : sim.characters.map((c) => c.name),
          transcript,
          llmId: exec.llmId,
        });
        const reply = result?.reply?.trim();
        if (!reply) {
          finishSimulationReply(conv.id);
          return;
        }

        chat.sendMessage(
          reply,
          modeId,
          [],
          mode?.name,
          mode?.color,
          exec.useReasoning,
          exec.llmId,
          undefined,
          null,
          exec.disabledToolkits,
          {
            conversationId: conv.id,
            sessionKind: "navi",
            naviStateId: conv.naviStateId ?? "greeting",
            naviResults: conv.naviResults,
            naviPlan: conv.naviPlan,
            naviCoveredTips: conv.naviCoveredTips,
            naviCurrentProblem: conv.naviCurrentProblem,
            naviProblemQueue: conv.naviProblemQueue,
            simulationConfig: sim,
          },
          { rulesDisabled: !rulesEnabled },
        );
      } catch (err) {
        console.error("[simulation] merchant reply failed", err);
      } finally {
        finishSimulationReply(conv.id);
      }
    },
    [
      chat.sendMessage,
      selectedMode,
      modes,
      modeLlmId,
      useReasoning,
      disabledToolkits,
      rulesEnabled,
    ],
  );

  // Persist the full Navi ↔ merchant transcript to the simulation result file,
  // then have a reviewer AI evaluate how well Navi performed and append its report.
  const persistSimulationTranscript = useCallback(async (conv: Conversation) => {
    const sim = conv.simulationConfig;
    if (!sim) return;
    const bridge = getAppBridge();
    if (!bridge?.simulation?.writeResult) return;

    const visibleMessages = conv.messages.filter(
      (m) =>
        !m.hidden &&
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0,
    );

    const lines = visibleMessages.map((m) =>
      m.role === "assistant"
        ? `**Navi:** ${m.content.trim()}`
        : `**Händler:** ${m.content.trim()}`,
    );

    const transcript = visibleMessages.map((m) => ({
      speaker: (m.role === "assistant" ? "navi" : "merchant") as
        | "navi"
        | "merchant",
      content: m.content,
    }));

    // Ask the reviewer AI to judge Navi's performance (best-effort; non-fatal).
    let evaluationSection: string[] = [];
    if (bridge.simulation.evaluateRun) {
      try {
        const exec = getEffectiveChatExecution(conv, {
          llmId: modeLlmId,
          useReasoning,
          disabledToolkits,
        });
        const evaluation = await bridge.simulation.evaluateRun({
          persona: sim.personaPrompt?.trim() || sim.goal,
          personaName: sim.personaName,
          transcript,
          llmId: exec.llmId,
        });
        if (evaluation?.report) {
          evaluationSection = [
            ``,
            `---`,
            ``,
            `## KI-Bewertung des Navi`,
            ``,
            evaluation.report,
            ``,
          ];
        }
      } catch (err) {
        console.error("[simulation] navi evaluation failed", err);
      }
    }

    const body = [
      `# ${conv.title ?? "Simulation"}`,
      ``,
      sim.personaName ? `**Persona:** ${sim.personaName}` : undefined,
      sim.goal ? `**Ziel:** ${sim.goal}` : undefined,
      sim.characters.length > 0
        ? `**Charaktere:** ${sim.characters.map((c) => c.name).join(", ")}`
        : undefined,
      ``,
      `---`,
      ``,
      `## Gesprächsverlauf`,
      ``,
      lines.join("\n\n"),
      ``,
      ...evaluationSection,
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    const writeResult = await bridge.simulation
      .writeResult(sim.resultFile, body)
      .catch(() => null);

    // Open the result file as a tab in the editor so the user can read it immediately.
    if (writeResult?.path) {
      void fileEditor.openFile(writeResult.path);
    }
  }, [modeLlmId, useReasoning, disabledToolkits, fileEditor.openFile]);

  // Simulation runner: after Navi answered, fire the queued merchant reply (until closing).
  useEffect(() => {
    const conv = history.activeConversation;
    if (!conv) return;
    if (conv.sessionKind !== "navi" || !conv.simulationConfig) return;
    if (!hasPendingSimulationReply(conv.id)) return;
    if (chat.streaming) return;
    if (chat.messages.length !== conv.messages.length) return;

    // Stop the auto-run at closing, or after a safety cap (refine_recommendation can loop).
    const reachedClosing = (conv.naviStateId ?? "greeting") === "closing";
    const merchantTurns = conv.messages.filter(
      (m) => !m.hidden && m.role === "user",
    ).length;
    if (reachedClosing || merchantTurns >= SIMULATION_MAX_TURNS) {
      clearSimulationReply(conv.id);
      void persistSimulationTranscript(conv);
      return;
    }
    if (!tryStartSimulationReply(conv.id)) return;
    void performSimulationReply(conv);
  }, [
    history.activeConversation,
    chat.messages,
    chat.streaming,
    performSimulationReply,
    persistSimulationTranscript,
  ]);

  // Subthread result: when the parent becomes active and has a pending result kickoff, integrate it.
  useEffect(() => {
    const conv = history.activeConversation;
    if (!conv) return;
    if (!hasPendingParentResultKickoffFor(conv.id)) return;
    if (conv.sessionKind !== "guided") return;
    if (chat.messages.length !== conv.messages.length) return;
    if (chat.streaming) return;

    const entry = consumeNextPendingKickoffFor(conv.id);
    if (!entry) return;

    if (!tryMarkKickoffStarted(entry.token)) return;

    performParentResultKickoff(conv);
  }, [
    history.activeConversation,
    chat.messages,
    chat.streaming,
    performParentResultKickoff,
  ]);

  const modesForChat = useMemo(() => {
    const base = standardChatModes(modes);
    const cur = modes.find((m) => m.id === selectedMode);
    if (cur?.agentOnly && !base.some((m) => m.id === cur.id)) {
      return [...base, cur];
    }
    return base;
  }, [modes, selectedMode]);

  const handlePromptPackGenerate = useCallback(
    (message: string, files: string[]) => {
      const m = modes.find((x) => x.id === "prompt-pack");
      const conv = history.activeConversation;
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      chat.sendMessage(
        message,
        "prompt-pack",
        files,
        m?.name ?? "Prompt-Paket",
        m?.color ?? "#f9e2af",
        exec.useReasoning,
        exec.llmId,
        undefined,
        null,
        exec.disabledToolkits,
        {
          conversationId: conv?.id ?? history.activeId,
          sessionKind: "standard",
        },
        { ...(!rulesEnabled ? { rulesDisabled: true } : {}) },
      );
      history.patchConversation(history.activeId, { mode: "prompt-pack" });
      setPromptPackOpen(false);
    },
    [
      chat.sendMessage,
      modes,
      useReasoning,
      modeLlmId,
      disabledToolkits,
      rulesEnabled,
      history.activeConversation,
      history.activeId,
      history.patchConversation,
    ],
  );

  useEffect(() => {
    if (!modes.length) return;
    if (selectedMode === "prompt-pack") {
      const std = standardChatModes(modes);
      const fallbackId = resolveDefaultModeId(std, undefined);
      handleModeChange(fallbackId, modes);
    }
  }, [modes, selectedMode, handleModeChange]);

  const handleNewChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const preset =
          payload.sessionKind === "guided" && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === "guided") {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === "guided"
            ? preset.modeId
            : selectedMode;
        const titleArg = payload.title.trim() || undefined;
        const newConv = history.createConversation(
          modeForCreate,
          undefined,
          titleArg,
          payload.sessionKind,
        );
        if (preset && payload.sessionKind === "guided") {
          const agentPatch = buildGuidedAgentPatchFromPreset(
            preset,
            payload.initialSteeringPlan,
            payload.agentPresetId,
          );
          history.patchConversation(newConv.id, agentPatch);
          if (
            agentPatch.steeringPlan?.trim() &&
            agentPatch.agentPresetId?.trim()
          ) {
            scheduleGuidedAgentPresetKickoff(newConv.id);
          }
        } else {
          applyGuidedAgentFromNewChatDialog(
            newConv.id,
            payload,
            selectedMode,
            { llmId: modeLlmId, useReasoning, disabledToolkits },
            history.patchConversation,
          );
          // Guided chat ohne Agent-Preset: KI soll trotzdem als erste sprechen.
          if (payload.sessionKind === "guided") {
            scheduleGuidedAgentPresetKickoff(newConv.id);
          }
          if (payload.sessionKind === "navi") {
            history.patchConversation(
              newConv.id,
              buildNaviConversationPatch(naviConfigRef.current, modes, llms),
            );
            scheduleNaviGreetingKickoff(newConv.id);
          }
        }
        return;
      }
      const sk = (kindOrPayload as ChatSessionKind | undefined) ?? "standard";
      const std = standardChatModes(modes);
      let modeForNew = selectedMode;
      if (sk === "standard" && !std.some((m) => m.id === modeForNew)) {
        modeForNew = resolveDefaultModeId(std, undefined);
        handleModeChange(modeForNew, modes);
      }
      history.createConversation(modeForNew, undefined, undefined, sk);
    },
    [
      history,
      selectedMode,
      modeLlmId,
      useReasoning,
      disabledToolkits,
      modes,
      llms,
      handleModeChange,
      agentPresets,
    ],
  );

  const handleCreateSimulation = useCallback(
    async (result: SimulationSetupResult) => {
      setSimulationSetupOpen(false);
      const { title, simulationConfig } = result;
      const newConv = history.createConversation(selectedMode, undefined, title, "navi");
      history.patchConversation(newConv.id, {
        simulationConfig,
        ...buildNaviConversationPatch(naviConfigRef.current, modes, llms),
      });
      scheduleNaviGreetingKickoff(newConv.id);
      // Create the result file with a placeholder — will be overwritten with the full
      // transcript + evaluation once the simulation finishes.
      const bridge = getAppBridge();
      if (bridge?.simulation?.writeResult) {
        const header = [
          `# ${title}`,
          ``,
          simulationConfig.personaName
            ? `**Persona:** ${simulationConfig.personaName}`
            : undefined,
          simulationConfig.goal
            ? `**Testfokus:** ${simulationConfig.goal}`
            : undefined,
          ``,
          `_Simulation läuft…_`,
          ``,
        ].filter((l) => l !== undefined).join("\n");
        await bridge.simulation.writeResult(simulationConfig.resultFile, header).catch(() => {});
      }
    },
    [history, selectedMode, modes, llms],
  );

  const handleDiscardCurrentChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const preset =
          payload.sessionKind === "guided" && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === "guided") {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === "guided"
            ? preset.modeId
            : selectedMode;
        const newConv = history.discardActiveAndCreateConversation(
          modeForCreate,
          payload.sessionKind,
        );
        const t = payload.title.trim();
        if (t) {
          history.patchConversation(newConv.id, { title: t });
        }
        if (preset && payload.sessionKind === "guided") {
          const agentPatch = buildGuidedAgentPatchFromPreset(
            preset,
            payload.initialSteeringPlan,
            payload.agentPresetId,
          );
          history.patchConversation(newConv.id, agentPatch);
          if (
            agentPatch.steeringPlan?.trim() &&
            agentPatch.agentPresetId?.trim()
          ) {
            scheduleGuidedAgentPresetKickoff(newConv.id);
          }
        } else {
          applyGuidedAgentFromNewChatDialog(
            newConv.id,
            payload,
            selectedMode,
            { llmId: modeLlmId, useReasoning, disabledToolkits },
            history.patchConversation,
          );
          // Guided chat ohne Agent-Preset: KI soll trotzdem als erste sprechen.
          if (payload.sessionKind === "guided") {
            scheduleGuidedAgentPresetKickoff(newConv.id);
          }
          if (payload.sessionKind === "navi") {
            history.patchConversation(
              newConv.id,
              buildNaviConversationPatch(naviConfigRef.current, modes, llms),
            );
            scheduleNaviGreetingKickoff(newConv.id);
          }
        }
        return;
      }
      const skDiscard =
        (kindOrPayload as ChatSessionKind | undefined) ?? "standard";
      const stdDiscard = standardChatModes(modes);
      let modeDiscard = selectedMode;
      if (
        skDiscard === "standard" &&
        !stdDiscard.some((m) => m.id === modeDiscard)
      ) {
        modeDiscard = resolveDefaultModeId(stdDiscard, undefined);
        handleModeChange(modeDiscard, modes);
      }
      history.discardActiveAndCreateConversation(modeDiscard, skDiscard);
    },
    [
      history,
      selectedMode,
      modeLlmId,
      useReasoning,
      disabledToolkits,
      modes,
      llms,
      handleModeChange,
      agentPresets,
    ],
  );

  const handleForkToNewConversation = useCallback(
    (index: number) => {
      if (history.activeConversation?.isThread) return;
      const forkedMessages = chat.messages.slice(0, index + 1);
      const baseTitle = history.activeConversation?.title ?? "Chat";
      const base = `${baseTitle}-fork`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;
      const parent = history.activeConversation;
      const sk = parent?.sessionKind ?? "standard";
      const preset =
        parent?.agentPresetId != null
          ? agentPresets.find((a) => a.id === parent.agentPresetId)
          : undefined;
      const threadModeId = preset?.threadModeId?.trim();
      const forkMode =
        threadModeId && modes.some((m) => m.id === threadModeId)
          ? threadModeId
          : selectedMode;
      const newConv = history.createConversation(
        forkMode,
        forkedMessages,
        `${base} (${n})`,
        sk,
      );
      if (sk === "guided" && parent?.steeringPlan) {
        history.patchConversation(newConv.id, {
          steeringPlan: parent.steeringPlan,
        });
      }
      const agentPatch = parent ? agentExecutionPartialFromParent(parent) : {};
      const guidedPresetPatch =
        parent && sk === "guided" ? guidedPresetPartialFromParent(parent) : {};
      const threadExec = threadExecutionOverrideFromPreset(preset, llms, modes);
      const forkPatches = {
        ...agentPatch,
        ...guidedPresetPatch,
        ...threadExec,
      };
      if (Object.keys(forkPatches).length > 0) {
        history.patchConversation(newConv.id, forkPatches);
      }
    },
    [agentPresets, chat.messages, history, llms, modes, selectedMode],
  );

  /** New conversation: parent transcript for API only (hidden); UI shows only new thread messages. */
  const handleStartThreadFromMessage = useCallback(
    (messageIndex: number) => {
      const parent = history.activeConversation;
      if (!parent) return;
      if (messageIndex < 0 || messageIndex >= chat.messages.length) return;

      const baseTitle = parent.title?.trim() || "Chat";
      const base = `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;

      const initialMessages = buildThreadHiddenBootstrap(
        baseTitle,
        chat.messages,
        messageIndex,
      );

      const sk = parent.sessionKind ?? "standard";
      const preset =
        parent.agentPresetId != null
          ? agentPresets.find((a) => a.id === parent.agentPresetId)
          : undefined;
      const threadModeId = preset?.threadModeId?.trim();
      const threadMode =
        threadModeId && modes.some((m) => m.id === threadModeId)
          ? threadModeId
          : parent.mode || selectedMode;
      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
        sk,
      );
      if (sk === "guided" && parent.steeringPlan) {
        history.patchConversation(newConv.id, {
          steeringPlan: parent.steeringPlan,
        });
      }
      const agentPatch = agentExecutionPartialFromParent(parent);
      const guidedPresetPatch =
        sk === "guided" ? guidedPresetPartialFromParent(parent) : {};
      const threadExec = threadExecutionOverrideFromPreset(preset, llms, modes);
      const threadPatches = {
        ...agentPatch,
        ...guidedPresetPatch,
        ...threadExec,
      };
      if (Object.keys(threadPatches).length > 0) {
        history.patchConversation(newConv.id, threadPatches);
      }
      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
    },
    [agentPresets, chat.messages, history, llms, modes, selectedMode],
  );

  /** User accepted a ```guided_thread_offer from the assistant: new guided thread with the offered plan. */
  const handleAcceptGuidedThreadFromOffer = useCallback(
    (messageIndex: number, offer: GuidedThreadOfferPayload) => {
      const parent = history.activeConversation;
      if (!parent) return;
      if (messageIndex < 0 || messageIndex >= chat.messages.length) return;

      const baseTitle = parent.title?.trim() || "Chat";
      const base = offer.threadTitle?.trim() || `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;
      const title = `${base} (${n})`;

      const initialMessages = buildThreadHiddenBootstrap(
        baseTitle,
        chat.messages,
        messageIndex,
      );

      const pid = offer.agentPresetId?.trim();
      const preset = pid ? agentPresets.find((a) => a.id === pid) : undefined;
      const threadModeIdFromPreset = preset?.threadModeId?.trim();
      const modeIdOffer = offer.modeId?.trim();
      const threadMode =
        threadModeIdFromPreset &&
        modes.some((m) => m.id === threadModeIdFromPreset)
          ? threadModeIdFromPreset
          : modeIdOffer && modes.some((m) => m.id === modeIdOffer)
            ? modeIdOffer
            : parent.mode || selectedMode;

      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        title,
        "guided",
      );

      if (preset) {
        history.patchConversation(
          newConv.id,
          buildGuidedAgentPatchFromPreset(preset, undefined, pid),
        );
        history.patchConversation(newConv.id, {
          steeringPlan: offer.steeringPlanMarkdown.trim(),
          mode: threadMode,
        });
        scheduleGuidedAgentPresetKickoff(newConv.id);
      } else {
        history.patchConversation(newConv.id, {
          steeringPlan: offer.steeringPlanMarkdown.trim(),
        });
        if (conversationHasAgentExecution(parent)) {
          history.patchConversation(
            newConv.id,
            agentExecutionPartialFromParent(parent),
          );
        } else {
          history.patchConversation(
            newConv.id,
            buildAgentExecutionPatchFromGlobals({
              llmId: modeLlmId,
              useReasoning,
              disabledToolkits,
            }),
          );
        }
      }

      const threadExec = threadExecutionOverrideFromPreset(preset, llms, modes);
      if (Object.keys(threadExec).length > 0) {
        history.patchConversation(newConv.id, threadExec);
      }

      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
    },
    [
      agentPresets,
      chat.messages,
      disabledToolkits,
      history,
      llms,
      modeLlmId,
      modes,
      selectedMode,
      useReasoning,
    ],
  );

  const handleSwitchChat = useCallback(
    (id: string) => {
      history.switchConversation(id);
    },
    [history],
  );

  const handleMarkSteeringPlanComplete = useCallback(() => {
    const conv = history.activeConversation;
    if (!conv || conv.sessionKind !== "guided") return;
    const current = conv.steeringPlan ?? "";
    if (!current.trim()) return;
    const next = ensureSteeringPlanMarkedComplete(current);
    history.patchConversation(conv.id, { steeringPlan: next });
  }, [history]);

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
            naviStateId={history.activeConversation?.naviStateId ?? null}
            naviResults={history.activeConversation?.naviResults}
            naviPlan={history.activeConversation?.naviPlan}
            naviCoveredTips={history.activeConversation?.naviCoveredTips}
            naviCurrentProblem={history.activeConversation?.naviCurrentProblem}
            naviProblemQueue={history.activeConversation?.naviProblemQueue}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="outliner"
          panelRef={leftPanelRef}
          defaultSize="18%"
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
            <button
              type="button"
              className="center-pane-wide-toggle"
              onClick={handleToggleCenterPanels}
              title={
                centerPaneWide
                  ? "Seitenleisten wieder anzeigen"
                  : "Seitenleisten ausblenden (breiter Editor)"
              }
              aria-pressed={centerPaneWide}
            >
              {centerPaneWide ? (
                <Minimize2 size={17} strokeWidth={2} />
              ) : (
                <Maximize2 size={17} strokeWidth={2} />
              )}
            </button>
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
                onCloseFile={fileEditor.closeFile}
                onCtrlL={handleCtrlL}
                onAltVersion={handleAltVersion}
                scrollToLine={fileEditor.pendingScroll?.line}
                scrollNonce={fileEditor.pendingScroll?.nonce}
                onScrollHandled={fileEditor.clearPendingScroll}
              />
            ) : (
              <MediaProjectEditor
                editorMode={proseEditorMode}
                proseLeafAtScene={
                  workspaceModeSchema?.proseLeafLevel === "scene"
                }
                chapter={chapter.activeChapter}
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
          defaultSize="37%"
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
                naviStep={chat.naviStepForCard}
                theme={
                  preferences.appearance.theme === "light" ? "light" : "dark"
                }
                modes={modesForChat}
                selectedMode={selectedMode}
                referencedFiles={refs.referencedFiles}
                conversations={history.conversations}
                activeConversationId={history.activeId}
                useReasoning={useReasoning}
                onToggleReasoning={handleToggleReasoning}
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
                onAcceptGuidedThreadOffer={handleAcceptGuidedThreadFromOffer}
                onEditMessage={conversation.editMessage}
                onDeleteMessages={conversation.deleteMessages}
                onNewChat={handleNewChat}
                onDiscardCurrentChat={handleDiscardCurrentChat}
                agentPresets={agentPresets}
                activeSessionKind={
                  history.activeConversation?.sessionKind ?? "standard"
                }
                naviStateId={history.activeConversation?.naviStateId ?? null}
                naviResults={history.activeConversation?.naviResults}
                naviPlan={history.activeConversation?.naviPlan}
                naviCoveredTips={history.activeConversation?.naviCoveredTips}
                naviCurrentProblem={history.activeConversation?.naviCurrentProblem}
                naviProblemQueue={history.activeConversation?.naviProblemQueue}
                steeringPlan={history.activeConversation?.steeringPlan ?? ""}
                simulationConfig={history.activeConversation?.simulationConfig}
                onOpenSimulationSetup={() => setSimulationSetupOpen(true)}
                activeIsThread={history.activeConversation?.isThread === true}
                onMarkSteeringPlanComplete={handleMarkSteeringPlanComplete}
                onSwitchChat={handleSwitchChat}
                onDeleteChat={history.deleteConversation}
                onRenameChat={history.renameConversation}
                onToggleSavedToProject={history.toggleSavedToProject}
                onClearAllBrowserChats={history.clearAllBrowserChats}
                clearAllBrowserChatsDisabled={
                  !project.projectPath || !history.hydrated
                }
                chatDownloadEnabled={chatDownloadFeatureEnabled}
                onOpenPromptPack={() => setPromptPackOpen(true)}
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
            defaultTool="navi-state"
            conversations={history.conversations}
            activeConversationId={history.activeId}
            onSwitchChat={handleSwitchChat}
            naviStateId={history.activeConversation?.naviStateId ?? null}
            naviResults={history.activeConversation?.naviResults}
            naviPlan={history.activeConversation?.naviPlan}
            naviCoveredTips={history.activeConversation?.naviCoveredTips}
            naviCurrentProblem={history.activeConversation?.naviCurrentProblem}
            naviProblemQueue={history.activeConversation?.naviProblemQueue}
          />
        </Panel>
      </Group>

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
        streaming={conversation.streaming}
        hasPromptPackMode={modes.some((m) => m.id === "prompt-pack")}
      />

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
        />
      )}

      {altVersionSession && (
        <AlternativeVersionPanel
          session={altVersionSession}
          onClose={() => setAltVersionSession(null)}
        />
      )}

      {appearanceOpen && (
        <AppearanceModal
          preferences={preferences}
          onUpdate={updatePreferences}
          onClose={() => setAppearanceOpen(false)}
        />
      )}

      {simulationSetupOpen && (
        <SimulationSetupModal
          onConfirm={handleCreateSimulation}
          onCancel={() => setSimulationSetupOpen(false)}
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
