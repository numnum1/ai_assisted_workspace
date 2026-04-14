import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw, Maximize2, Minimize2, Upload } from 'lucide-react';
import { FileTreeOutliner } from './components/outliner/FileTreeOutliner.tsx';
import { MarkdownFileEditor } from './components/editor/MarkdownFileEditor.tsx';
import { SubprojectTypeDialog } from './components/settings/SubprojectTypeDialog.tsx';
import { MetaPanel } from './components/meta/MetaPanel.tsx';
import { ChatPanel } from './components/chat/ChatPanel.tsx';
import { FieldEditorPanel } from './components/editor/FieldEditorPanel.tsx';
import { PromptPackModal } from './components/chat/PromptPackModal.tsx';
import { ContextBar } from './components/chat/ContextBar.tsx';
import { CommandPalette } from './components/git/CommandPalette.tsx';
import { GitCredentialsDialog } from './components/git/GitCredentialsDialog.tsx';
import { FileHistoryModal } from './components/git/FileHistoryModal.tsx';
import { ProjectSettingsModal } from './components/settings/ProjectSettingsModal.tsx';
import type { CommandAction } from './components/git/CommandPalette.tsx';
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
  ChatMessage,
} from './types.ts';
import type { NewChatConfirmPayload } from './components/chat/NewChatDialog.tsx';
import { CHAT_TOOLKIT_IDS } from './types.ts';
import { modesApi, gitApi, projectApi, projectConfigApi, bookApi, llmApi, chatApi, AuthRequiredError } from './api.ts';
import { buildThreadSystemContent, cloneChatMessages } from './components/chat/chatThreadUtils.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChapter } from './hooks/useChapter.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';
import { useWorkspaceMode } from './hooks/useWorkspaceMode.ts';
import { useWorkspaceLevelConfigMap } from './hooks/useWorkspaceLevelConfigMap.ts';
import { useOutlinerScope } from './hooks/useOutlinerScope.ts';
import { useFileTabs } from './hooks/useFileTabs.ts';
import { EditorTabs } from './components/editor/EditorTabs.tsx';
import { SearchPanel } from './components/editor/SearchPanel.tsx';
import { getMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';
import { AlternativeVersionPanel } from './components/editor/AlternativeVersionPanel.tsx';
import { QuickChatWindow } from './components/chat/QuickChatWindow.tsx';
import {
  ensureSteeringPlanMarkedComplete,
  parseSteeringPlanFromAssistant,
} from './components/chat/planFenceUtils.ts';
import {
  agentExecutionPartialFromParent,
  applyGuidedAgentFromNewChatDialog,
  buildGuidedAgentPatchFromPreset,
  buildAgentExecutionPatchFromGlobals,
  conversationHasAgentExecution,
  getEffectiveChatExecution,
  isNewChatConfirmPayload,
} from './components/chat/chatAgentUtils.ts';

/** Matches user message label for prompt-pack mode in chat UI (see ChatPanel). */
const PROMPT_PACK_DISPLAY_NAME = 'Prompt-Paket';

function nonPromptModes(mds: Mode[]): Mode[] {
  return mds.filter((m) => m.id !== 'prompt-pack');
}

/** Modes shown in the main chat mode menu and as project default (excludes agent-only). */
function standardChatModes(mds: Mode[]): Mode[] {
  return nonPromptModes(mds).filter((m) => !m.agentOnly);
}

function resolveDefaultModeId(mds: Mode[], configured: string | undefined): string {
  const id = configured?.trim() ?? '';
  if (id && mds.some((m) => m.id === id)) return id;
  if (mds.some((m) => m.id === 'review')) return 'review';
  if (mds.length > 0) return mds[0].id;
  return 'review';
}

function conversationHasVisibleMessages(conv: Conversation): boolean {
  return conv.messages.some((m) => !m.hidden);
}

/**
 * Resolves mode id from persisted conversation (non–prompt-pack only).
 * Agent-only modes are kept for guided sessions; for standard chat they are ignored.
 */
function resolvePersistedChatModeId(conv: Conversation, nonPrompt: Mode[], allModes: Mode[]): string | null {
  const sessionKind = conv.sessionKind ?? 'standard';
  const allowed = (modeId: string): boolean => {
    const m = nonPrompt.find((x) => x.id === modeId);
    if (!m) return false;
    if (m.agentOnly && sessionKind !== 'guided') return false;
    return true;
  };
  if (conv.mode && conv.mode !== 'prompt-pack' && allowed(conv.mode)) return conv.mode;

  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.hidden || m.role !== 'user' || !m.mode) continue;
    if (m.mode === PROMPT_PACK_DISPLAY_NAME) continue;
    const found = allModes.find((mode) => mode.name === m.mode);
    if (found && found.id !== 'prompt-pack' && allowed(found.id)) return found.id;
  }
  return null;
}

const LLM_PREFS_KEY = 'chat-llm-prefs';
const CHAT_DISABLED_TOOLKITS_KEY = 'chat-disabled-toolkits';

function loadInitialDisabledToolkits(): Set<string> {
  try {
    const raw = localStorage.getItem(CHAT_DISABLED_TOOLKITS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
    }
    if (localStorage.getItem('chat-tools-disabled') === 'true') {
      localStorage.removeItem('chat-tools-disabled');
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

function loadLlmPrefs(): { llmId: string | null; useReasoning: boolean } | null {
  try {
    const raw = localStorage.getItem(LLM_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { llmId: string | null; useReasoning: boolean; useWebSearch?: boolean };
    return { llmId: parsed.llmId, useReasoning: parsed.useReasoning };
  } catch {
    return null;
  }
}

function saveLlmPrefs(llmId: string | undefined, useReasoning: boolean) {
  try {
    localStorage.setItem(LLM_PREFS_KEY, JSON.stringify({ llmId: llmId ?? null, useReasoning }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Compare disabled toolkit ids regardless of order or Set vs array (avoids update loops on new references). */
function disabledToolkitsSignature(ids: ReadonlySet<string> | readonly string[] | undefined | null): string {
  if (!ids) return '';
  const list = [...ids];
  if (list.length === 0) return '';
  return [...list].sort().join('\0');
}

function disabledToolkitSetMatchesArray(s: ReadonlySet<string>, arr: readonly string[] | undefined): boolean {
  return disabledToolkitsSignature(s) === disabledToolkitsSignature(arr);
}

function agentExecutionMatchesGlobals(
  conv: Conversation,
  globals: { llmId: string | undefined; useReasoning: boolean; disabledToolkits: ReadonlySet<string> },
): boolean {
  const patch = buildAgentExecutionPatchFromGlobals(globals);
  return (
    conv.agentLlmId === patch.agentLlmId &&
    conv.agentUseReasoning === patch.agentUseReasoning &&
    disabledToolkitsSignature(conv.agentDisabledToolkits) === disabledToolkitsSignature(patch.agentDisabledToolkits)
  );
}

/** Fingerprint persisted agent fields so we can tell when the conversation (not the toolbar) changed. */
function agentPersistSignature(conv: Conversation): string {
  if (!conversationHasAgentExecution(conv)) return '';
  return [
    conv.agentLlmId ?? '∅',
    conv.agentUseReasoning === undefined ? '∅' : String(conv.agentUseReasoning),
    disabledToolkitsSignature(conv.agentDisabledToolkits),
  ].join('|');
}

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const [modes, setModes] = useState<Mode[]>([]);
  const [agentPresets, setAgentPresets] = useState<AgentPreset[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');
  const [useReasoning, setUseReasoning] = useState(false);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);
  const [llms, setLlms] = useState<LlmPublic[]>([]);
  const llmsRef = useRef(llms);
  llmsRef.current = llms;
  const [disabledToolkits, setDisabledToolkits] = useState(loadInitialDisabledToolkits);

  const prefsHydratedRef = useRef(false);
  /** Last resolved project default chat mode id (from loadModes); used for empty chats and fallbacks. */
  const projectDefaultChatModeIdRef = useRef('review');
  /** Avoid toolbar ↔ conversation ping-pong: only pull agent fields from conv when conv or active chat actually changed. */
  const prevModeSyncActiveIdRef = useRef<string | null>(null);
  const prevAgentPersistSigRef = useRef('');

  const handleToggleReasoning = useCallback(() => setUseReasoning(v => !v), []);
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

  const handleLlmChange = useCallback((id: string | undefined) => {
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
  }, [llms, modes, selectedMode]);

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

  const handleModeChange = useCallback((modeId: string, modeList?: typeof modes) => {
    const list = modeList ?? modes;
    const m = list.find(x => x.id === modeId);
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
    setUseReasoning((prev) => (prev === newUseReasoning ? prev : newUseReasoning));
  }, [modes, llms]);

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
    onAssistantResponseComplete: (fullText, meta) => {
      if (meta.sessionKind !== 'guided') return;
      const parsed = parseSteeringPlanFromAssistant(fullText);
      if (parsed) {
        history.patchConversation(meta.conversationId, { steeringPlan: parsed });
      }
    },
  });

  /** Bumped after modes + LLM list load so chat mode can sync once project defaults are known. */
  const [modesAndLlmLoadGeneration, setModesAndLlmLoadGeneration] = useState(0);

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [workspaceModesRefreshNonce, setWorkspaceModesRefreshNonce] = useState(0);
  const [inlineChaptersNonce, setInlineChaptersNonce] = useState(0);
  const [subprojectDialog, setSubprojectDialog] = useState<{ path: string; initialType?: string | null } | null>(null);
  const outlinerScope = useOutlinerScope(project.projectPath ? project.projectPath : null);

  // Ctrl+L: capture editor selection for chat
  const [activeSelection, setActiveSelection] = useState<SelectionContext | null>(null);
  const activeSelectionReplaceFnRef = useRef<((from: number, to: number, text: string) => void) | null>(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  // Ctrl+Alt+A: alternative version panel
  const [altVersionSession, setAltVersionSession] = useState<AltVersionSession | null>(null);

  const leftPanelRef = usePanelRef();
  const centerPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();

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

  const handleAltVersion = useCallback((session: AltVersionSession) => {
    setAltVersionSession(session);
  }, []);

  // Project root changes: reset structure and editor state
  useEffect(() => {
    if (!project.projectPath) return;
    chapter.setProjectPath(project.projectPath);
    chapter.closeChapter();
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
      const [mds, status] = await Promise.all([modesApi.getAll(), projectConfigApi.status()]);
      setModes(mds);
      const forDefault = standardChatModes(mds);
      let configured: string | undefined;
      let agents: AgentPreset[] = [];
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
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
      if (configured === 'prompt-pack') configured = undefined;
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
    const sessionKind = conv.sessionKind ?? 'standard';
    const allowedForSession = sessionKind === 'guided' ? nonPrompt : standardSel;
    let desired: string;
    /** Threads (and similar) can have only hidden bootstrap messages — still use conv.mode / history, not project default. */
    const trulyEmptyForModeSync =
      !conversationHasVisibleMessages(conv) && conv.messages.length === 0;
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
    if (desired !== selectedMode) {
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
      const pullAgentFromConv = switchedConv || agentPersistChanged;

      if (pullAgentFromConv) {
        let gLlm: string | undefined = modeLlmId;
        let gReason = useReasoning;
        let gDisabled: ReadonlySet<string> = disabledToolkits;
        if (convAfter.agentLlmId !== undefined) gLlm = convAfter.agentLlmId;
        if (convAfter.agentUseReasoning !== undefined) gReason = convAfter.agentUseReasoning;
        if (convAfter.agentDisabledToolkits !== undefined) {
          gDisabled = new Set(convAfter.agentDisabledToolkits);
        }
        setModeLlmId((prev) => (prev === gLlm ? prev : gLlm));
        setUseReasoning((prev) => (prev === gReason ? prev : gReason));
        if (convAfter.agentDisabledToolkits !== undefined) {
          setDisabledToolkits((prev) => {
            if (disabledToolkitSetMatchesArray(prev, convAfter.agentDisabledToolkits)) return prev;
            return new Set(convAfter.agentDisabledToolkits);
          });
        }
        const target = { llmId: gLlm, useReasoning: gReason, disabledToolkits: gDisabled };
        if (!agentExecutionMatchesGlobals(convAfter, target)) {
          history.patchConversation(convAfter.id, buildAgentExecutionPatchFromGlobals(target));
        }
      } else {
        const globals = { llmId: modeLlmId, useReasoning, disabledToolkits };
        if (!agentExecutionMatchesGlobals(convAfter, globals)) {
          history.patchConversation(convAfter.id, buildAgentExecutionPatchFromGlobals(globals));
        }
      }
    } else if (prefsHydratedRef.current) {
      applyLlmPrefsFromStorage();
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
    selectedMode,
    modeLlmId,
    useReasoning,
    disabledToolkits,
  ]);

  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    saveLlmPrefs(modeLlmId, useReasoning);
  }, [modeLlmId, useReasoning]);

  useEffect(() => {
    saveDisabledToolkits(disabledToolkits);
  }, [disabledToolkits]);

  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [focusedField, setFocusedField] = useState<{ fieldKey: string; fieldLabel: string; value: string } | null>(null);

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

  const handleApplyFieldUpdate = useCallback(async (field: string, value: string) => {
    if (!selectedMeta || selectedMeta.type !== 'scene' || !selectedMeta.sceneId) return;
    const curr = selectedMeta.meta;
    const newMeta: NodeMeta = field === 'title'
      ? { ...curr, title: value }
      : field === 'description'
        ? { ...curr, description: value }
        : { ...curr, extras: { ...(curr.extras ?? {}), [field]: value } };
    await handleSaveMeta('scene', newMeta, selectedMeta.chapterId, selectedMeta.sceneId);
    // Keep field editor in sync when the AI applies a suggestion via chat
    setFocusedField(prev => prev?.fieldKey === field ? { ...prev, value } : prev);
  }, [selectedMeta, handleSaveMeta]);

  const handleOpenFieldEditor = useCallback((fieldKey: string, fieldLabel: string, value: string) => {
    setFocusedField({ fieldKey, fieldLabel, value });
    setMetaExpanded(false);
  }, []);

  const handleFieldEditorSave = useCallback(async (value: string) => {
    if (!focusedField) return;
    await handleApplyFieldUpdate(focusedField.fieldKey, value);
  }, [focusedField, handleApplyFieldUpdate]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [promptPackOpen, setPromptPackOpen] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportChatFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (typeof text !== 'string') return;
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            window.alert('Invalid chat history file: expected a JSON array of conversations.');
            return;
          }
          history.importConversations(parsed);
        } catch {
          window.alert('Failed to parse chat history file. Make sure it is a valid JSON file.');
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
        window.alert(err instanceof Error ? err.message : 'Revert fehlgeschlagen');
      }
    },
    [gitStatus, fetchGitState],
  );

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
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [centerPaneWide, setCenterPaneWide] = useState(false);

  useEffect(() => {
    const syncSidebarsWideState = () => {
      const left = leftPanelRef.current;
      const right = rightPanelRef.current;
      if (left && right) setCenterPaneWide(left.isCollapsed() && right.isCollapsed());
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setQuickChatOpen((v) => !v);
        return;
      }

      if (!e.altKey || e.shiftKey) return;

      const code = e.code;
      if (code === 'Digit1' || code === 'Numpad1') {
        e.preventDefault();
        const p = leftPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        syncSidebarsWideState();
        return;
      }
      if (code === 'Digit2' || code === 'Numpad2') {
        e.preventDefault();
        const p = centerPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        return;
      }
      if (code === 'Digit3' || code === 'Numpad3') {
        e.preventDefault();
        const p = rightPanelRef.current;
        if (!p) return;
        if (p.isCollapsed()) p.expand();
        else p.collapse();
        syncSidebarsWideState();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const handleOpenProject = useCallback(async (path: string) => {
    await project.openProject(path);
    await chapter.refreshChapters();
    loadModes();
  }, [project, chapter, loadModes]);

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

  const fieldLabels = useMemo(() => {
    const schema = workspaceMetaSchemas?.['scene'];
    if (!schema) return {} as Record<string, string>;
    return Object.fromEntries(schema.fields.map(f => [f.key, f.label])) as Record<string, string>;
  }, [workspaceMetaSchemas]);

  const MediaProjectEditor =
    getMediaProjectPlugin(workspaceModeId)?.ViewComponent ?? DefaultMediaProjectEditor;

  const fileEditor = useFileTabs(project.projectPath ?? null);

  const commandActions: CommandAction[] = useMemo(() => {
    const actions: CommandAction[] = [
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
      {
        id: 'import-chat',
        label: 'Import Chat History',
        icon: <Upload size={16} />,
        handler: () => {
          importFileInputRef.current?.click();
        },
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
    ];
    return actions;
  }, [hasUncommitted, syncBadge]);

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
      // Derive activeFile: scene JSON when a scene is selected, otherwise the open file
      const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
        ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
        : (fileEditor.selectedPath ?? null);
      const conv = history.activeConversation;
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      const streamSession = {
        conversationId: conv?.id ?? history.activeId,
        sessionKind: (conv?.sessionKind ?? 'standard') as ChatSessionKind,
        steeringPlan: conv?.steeringPlan,
      };
      chat.sendMessage(
        message,
        activeFile,
        selectedMode,
        refs.referencedFiles,
        mode?.name,
        mode?.color,
        exec.useReasoning,
        exec.llmId,
        activeSelection ?? undefined,
        focusedField?.fieldKey ?? null,
        exec.disabledToolkits,
        streamSession,
      );
      history.patchConversation(history.activeId, { mode: selectedMode });
      // Clear active selection after sending — the Replace button will use stored selectionContext on the message
      setActiveSelection(null);
    },
    [
      chat,
      selectedMode,
      modes,
      refs.referencedFiles,
      useReasoning,
      modeLlmId,
      activeSelection,
      selectedMeta,
      chapter.structureRoot,
      fileEditor.selectedPath,
      focusedField,
      disabledToolkits,
      history.activeConversation,
      history.activeId,
      history.patchConversation,
    ],
  );

  const handleEditMessage = useCallback(
    (index: number, newContent: string) => {
      const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
        ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
        : (fileEditor.selectedPath ?? null);
      const conv = history.activeConversation;
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      chat.editMessage(index, newContent, {
        activeFile,
        mode: selectedMode,
        referencedFiles: refs.referencedFiles,
        useReasoning: exec.useReasoning,
        llmId: exec.llmId,
        selectionContext: activeSelection ?? undefined,
        activeFieldKey: focusedField?.fieldKey ?? null,
        disabledToolkits: exec.disabledToolkits,
        conversationId: conv?.id ?? history.activeId,
        sessionKind: (conv?.sessionKind ?? 'standard') as ChatSessionKind,
        steeringPlan: conv?.steeringPlan,
      });
      history.patchConversation(history.activeId, { mode: selectedMode });
      setActiveSelection(null);
    },
    [
      chat,
      selectedMode,
      refs.referencedFiles,
      useReasoning,
      modeLlmId,
      activeSelection,
      selectedMeta,
      chapter.structureRoot,
      fileEditor.selectedPath,
      focusedField,
      disabledToolkits,
      history.activeConversation,
      history.activeId,
      history.patchConversation,
    ],
  );

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
      const m = modes.find(x => x.id === 'prompt-pack');
      const conv = history.activeConversation;
      const exec = getEffectiveChatExecution(conv, {
        llmId: modeLlmId,
        useReasoning,
        disabledToolkits,
      });
      chat.sendMessage(
        message,
        null,
        'prompt-pack',
        files,
        m?.name ?? 'Prompt-Paket',
        m?.color ?? '#f9e2af',
        exec.useReasoning,
        exec.llmId,
        undefined,
        null,
        exec.disabledToolkits,
        {
          conversationId: conv?.id ?? history.activeId,
          sessionKind: 'standard',
        },
      );
      history.patchConversation(history.activeId, { mode: 'prompt-pack' });
      setPromptPackOpen(false);
    },
    [chat, modes, useReasoning, modeLlmId, disabledToolkits, history.activeConversation, history.activeId, history.patchConversation],
  );

  useEffect(() => {
    if (!modes.length) return;
    if (selectedMode === 'prompt-pack') {
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
          payload.sessionKind === 'guided' && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === 'guided') {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === 'guided' ? preset.modeId : selectedMode;
        const titleArg = payload.title.trim() || undefined;
        const newConv = history.createConversation(
          modeForCreate,
          undefined,
          titleArg,
          payload.sessionKind,
        );
        if (preset && payload.sessionKind === 'guided') {
          history.patchConversation(newConv.id, buildGuidedAgentPatchFromPreset(preset, payload.initialSteeringPlan));
        } else {
          applyGuidedAgentFromNewChatDialog(
            newConv.id,
            payload,
            selectedMode,
            { llmId: modeLlmId, useReasoning, disabledToolkits },
            history.patchConversation,
          );
        }
        return;
      }
      const sk = (kindOrPayload as ChatSessionKind | undefined) ?? 'standard';
      const std = standardChatModes(modes);
      let modeForNew = selectedMode;
      if (sk === 'standard' && !std.some((m) => m.id === modeForNew)) {
        modeForNew = resolveDefaultModeId(std, undefined);
        handleModeChange(modeForNew, modes);
      }
      history.createConversation(modeForNew, undefined, undefined, sk);
    },
    [history, selectedMode, modeLlmId, useReasoning, disabledToolkits, modes, handleModeChange, agentPresets],
  );

  const handleDiscardCurrentChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const preset =
          payload.sessionKind === 'guided' && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === 'guided') {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === 'guided' ? preset.modeId : selectedMode;
        const newConv = history.discardActiveAndCreateConversation(
          modeForCreate,
          payload.sessionKind,
        );
        const t = payload.title.trim();
        if (t) {
          history.patchConversation(newConv.id, { title: t });
        }
        if (preset && payload.sessionKind === 'guided') {
          history.patchConversation(newConv.id, buildGuidedAgentPatchFromPreset(preset, payload.initialSteeringPlan));
        } else {
          applyGuidedAgentFromNewChatDialog(
            newConv.id,
            payload,
            selectedMode,
            { llmId: modeLlmId, useReasoning, disabledToolkits },
            history.patchConversation,
          );
        }
        return;
      }
      const skDiscard = (kindOrPayload as ChatSessionKind | undefined) ?? 'standard';
      const stdDiscard = standardChatModes(modes);
      let modeDiscard = selectedMode;
      if (skDiscard === 'standard' && !stdDiscard.some((m) => m.id === modeDiscard)) {
        modeDiscard = resolveDefaultModeId(stdDiscard, undefined);
        handleModeChange(modeDiscard, modes);
      }
      history.discardActiveAndCreateConversation(modeDiscard, skDiscard);
    },
    [history, selectedMode, modeLlmId, useReasoning, disabledToolkits, modes, handleModeChange, agentPresets],
  );

  const handleForkToNewConversation = useCallback((index: number) => {
    if (history.activeConversation?.isThread) return;
    const forkedMessages = chat.messages.slice(0, index + 1);
    const baseTitle = history.activeConversation?.title ?? 'Chat';
    const base = `${baseTitle}-fork`;
    const existingTitles = new Set(history.conversations.map((c) => c.title));
    let n = 1;
    while (existingTitles.has(`${base} (${n})`)) n++;
    const parent = history.activeConversation;
    const sk = parent?.sessionKind ?? 'standard';
    const newConv = history.createConversation(selectedMode, forkedMessages, `${base} (${n})`, sk);
    if (sk === 'guided' && parent?.steeringPlan) {
      history.patchConversation(newConv.id, { steeringPlan: parent.steeringPlan });
    }
    const agentPatch = parent ? agentExecutionPartialFromParent(parent) : {};
    if (Object.keys(agentPatch).length > 0) {
      history.patchConversation(newConv.id, agentPatch);
    }
  }, [chat.messages, history, selectedMode]);

  /** New conversation: parent transcript for API only (hidden); UI shows only new thread messages. */
  const handleStartThreadFromMessage = useCallback(
    (messageIndex: number) => {
      const parent = history.activeConversation;
      if (!parent || parent.isThread) return;
      if (messageIndex < 0 || messageIndex >= chat.messages.length) return;

      const baseTitle = parent.title?.trim() || 'Chat';
      const base = `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;

      const transcript = cloneChatMessages(chat.messages.slice(0, messageIndex + 1));
      const systemIntro: ChatMessage = {
        role: 'system',
        content: buildThreadSystemContent(baseTitle),
        hidden: true,
      };
      const initialMessages: ChatMessage[] = [
        systemIntro,
        ...transcript.map((m) => ({ ...m, hidden: true })),
      ];

      const sk = parent.sessionKind ?? 'standard';
      const threadMode = parent.mode || selectedMode;
      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
        sk,
      );
      if (sk === 'guided' && parent.steeringPlan) {
        history.patchConversation(newConv.id, { steeringPlan: parent.steeringPlan });
      }
      const agentPatch = agentExecutionPartialFromParent(parent);
      if (Object.keys(agentPatch).length > 0) {
        history.patchConversation(newConv.id, agentPatch);
      }
      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
    },
    [chat.messages, history, selectedMode],
  );

  const handleSwitchChat = useCallback((id: string) => {
    history.switchConversation(id);
  }, [history]);

  const handleMarkSteeringPlanComplete = useCallback(() => {
    const conv = history.activeConversation;
    if (!conv || conv.sessionKind !== 'guided') return;
    const current = conv.steeringPlan ?? '';
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

      <Group orientation="horizontal" className="app-panels">
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
            <div className={`outliner-slot${showMetaChrome ? ' split' : ''}`}>
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
              onOpenFileMeta={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  void fileEditor.openFile(path);
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
                  setFocusedField(null);
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
                  onClose={() => { setSelectedMeta(null); setMetaExpanded(false); setFocusedField(null); }}
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
              onOpenFile={(path) => {
                void fileEditor.openFile(path);
                setSearchOpen(false);
              }}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <button
            type="button"
            className="center-pane-wide-toggle"
            onClick={handleToggleCenterPanels}
            title={centerPaneWide ? 'Seitenleisten wieder anzeigen' : 'Seitenleisten ausblenden (breiter Editor)'}
            aria-pressed={centerPaneWide}
          >
            {centerPaneWide ? <Minimize2 size={17} strokeWidth={2} /> : <Maximize2 size={17} strokeWidth={2} />}
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
              onSave={() => { void fileEditor.save(); fetchGitState(); }}
              onClearError={fileEditor.clearError}
              onCloseFile={fileEditor.closeFile}
              onCtrlL={handleCtrlL}
              onAltVersion={handleAltVersion}
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
            disabledToolkits={disabledToolkits}
            onToggleToolkit={handleToggleToolkit}
            reasoningAvailable={reasoningAvailable}
            fastAvailable={fastAvailable}
            onModeChange={handleModeChange}
            llms={llms}
            selectedLlmId={modeLlmId}
            onLlmChange={handleLlmChange}
            onSend={handleSendMessage}
            onStop={chat.stopStreaming}
            onRetry={chat.retry}
            onAddFile={refs.addFile}
            onRemoveFile={refs.removeFile}
            onForkFromMessage={chat.forkFromMessage}
            onForkToNewConversation={handleForkToNewConversation}
            onStartThreadFromMessage={handleStartThreadFromMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={chat.deleteMessage}
            onNewChat={handleNewChat}
            onDiscardCurrentChat={handleDiscardCurrentChat}
            agentPresets={agentPresets}
            activeSessionKind={history.activeConversation?.sessionKind ?? 'standard'}
            steeringPlan={history.activeConversation?.steeringPlan ?? ''}
            activeIsThread={history.activeConversation?.isThread === true}
            onMarkSteeringPlanComplete={handleMarkSteeringPlanComplete}
            onSwitchChat={handleSwitchChat}
            onDeleteChat={history.deleteConversation}
            onRenameChat={history.renameConversation}
            onToggleSavedToProject={history.toggleSavedToProject}
            onClearAllBrowserChats={history.clearAllBrowserChats}
            clearAllBrowserChatsDisabled={!project.projectPath || !history.hydrated}
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
          />
        </Panel>
      </Group>

      <ContextBar
        contextInfo={chat.contextInfo}
        activeFile={activeChapterTitle}
        isDirty={chapter.hasDirtyActions}
        onFetchContextBlocks={async () => {
          const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
            ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
            : (fileEditor.selectedPath ?? null);
          const conv = history.activeConversation;
          const exec = getEffectiveChatExecution(conv, {
            llmId: modeLlmId,
            useReasoning,
            disabledToolkits,
          });
          const result = await chatApi.previewContext({
            message: '',
            activeFile,
            activeFieldKey: focusedField?.fieldKey ?? null,
            mode: selectedMode,
            referencedFiles: refs.referencedFiles,
            history: [],
            useReasoning: exec.useReasoning,
            llmId: exec.llmId,
            disabledToolkits: exec.disabledToolkits,
            sessionKind: conv?.sessionKind ?? 'standard',
            steeringPlan: conv?.sessionKind === 'guided' ? conv.steeringPlan ?? null : undefined,
          });
          return result.contextBlocks ?? [];
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

      <PromptPackModal
        open={promptPackOpen}
        onClose={() => setPromptPackOpen(false)}
        onGenerate={handlePromptPackGenerate}
        streaming={chat.streaming}
        hasPromptPackMode={modes.some(m => m.id === 'prompt-pack')}
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
        <FileHistoryModal filePath={fileHistoryPath} onClose={() => setFileHistoryPath(null)} />
      )}

      {altVersionSession && (
        <AlternativeVersionPanel
          session={altVersionSession}
          onClose={() => setAltVersionSession(null)}
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
        style={{ display: 'none' }}
        onChange={handleImportChatFile}
      />
    </div>
  );
}

export default App;
