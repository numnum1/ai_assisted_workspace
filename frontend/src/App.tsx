import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { FolderOpen } from "lucide-react";
import { ChatPanel } from "./components/chat/ChatPanel.tsx";
import { NaviStatePanel } from "./components/chat/NaviStatePanel.tsx";
import {
  SimulationSetupModal,
  type SimulationSetupResult,
} from "./components/simulation/SimulationSetupModal.tsx";
import { AppearanceModal } from "./components/settings/AppearanceModal.tsx";
import type {
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ReasoningEffort,
} from "./types.ts";
import { modesApi, projectApi, projectConfigApi, llmApi } from "./api.ts";

import { usePreferences } from "./hooks/usePreferences.ts";
import { useProject } from "./hooks/useProject.ts";
import { useChat } from "./hooks/useChat.ts";
import { useReferencedFiles } from "./hooks/useContext.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useSimulationRunner } from "./hooks/useSimulationRunner.ts";
import { useConversationActions } from "./hooks/useConversationActions.ts";
import { useConversationModel } from "./hooks/useConversationModel.ts";
import { getAppBridge } from "./electron/bridge.ts";
import {
  buildNaviConversationPatch,
} from "./components/chat/chatAgentUtils.ts";
import { standardChatModes, resolveDefaultModeId } from "./components/chat/effectiveChatModeForRequest.ts";
import { scheduleNaviGreetingKickoff } from "./components/chat/naviGreetingKickoff.ts";
import {
  cancelNaviGreetingKickoffIfMismatch,
  hasPendingNaviGreetingKickoffFor,
  tryMarkNaviGreetingKickoffStarted,
} from "./components/chat/naviGreetingKickoff.ts";
import { effectiveChatModeIdForRequest } from "./components/chat/effectiveChatModeForRequest.ts";
import { getEffectiveChatExecution } from "./components/chat/chatAgentUtils.ts";
import {
  loadInitialDisabledToolkits,
  loadInitialRulesEnabled,
  loadLlmPrefs,
  saveLlmPrefs,
  saveDisabledToolkits,
  saveRulesEnabled,
} from "./utils/chatStorage.ts";

function App() {
  const project = useProject();
  const refs = useReferencedFiles();
  const { preferences, updatePreferences } = usePreferences();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [modes, setModes] = useState<Mode[]>([]);
  const [simulationSetupOpen, setSimulationSetupOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState("review");
  const [useReasoning, setUseReasoning] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);
  const [llms, setLlms] = useState<LlmPublic[]>([]);
  const llmsRef = useRef(llms);
  llmsRef.current = llms;
  const [disabledToolkits, setDisabledToolkits] = useState(
    loadInitialDisabledToolkits,
  );
  const [rulesEnabled, setRulesEnabled] = useState(loadInitialRulesEnabled);
  const [browsePathInput, setBrowsePathInput] = useState("");

  const naviConfigRef = useRef<{ modeId?: string; llmId?: string }>({});
  const projectDefaultChatModeIdRef = useRef("review");

  const [activeSelection, setActiveSelection] =
    useState<SelectionContext | null>(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  const handleDismissSelection = useCallback(() => {
    setActiveSelection(null);
  }, []);

  const clearActiveSelectionForChat = useCallback(() => {
    setActiveSelection(null);
  }, []);

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
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
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
          if (!hasReasoning) setUseReasoning(false);
          else if (!hasFast) setUseReasoning(true);
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
          if (!hasReasoning) newUseReasoning = false;
          else if (!hasFast) newUseReasoning = true;
        }
      }
      setSelectedMode((prev) => (prev === modeId ? prev : modeId));
      setModeLlmId((prev) => (prev === llmId ? prev : llmId));
      setUseReasoning((prev) => (prev === newUseReasoning ? prev : newUseReasoning));
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
  const chat = useChat(history.updateMessages, {
    onNaviStateTransition: (stateId, conversationId) => {
      history.patchConversation(conversationId, { naviStateId: stateId });
    },
    onNaviTipsCovered: (coveredIds, conversationId) => {
      const conv = history.conversations.find((c) => c.id === conversationId);
      const existing = conv?.naviCoveredTips ?? [];
      const merged = [...new Set([...existing, ...coveredIds])];
      history.patchConversation(conversationId, { naviCoveredTips: merged });
    },
    onNaviFacts: (facts, conversationId) => {
      history.patchConversation(conversationId, { naviFacts: facts });
    },
    onNaviTrace: (entry, conversationId) => {
      const conv = history.conversations.find((c) => c.id === conversationId);
      const existing = conv?.naviTrace ?? [];
      const naviTrace = [...existing, entry].slice(-30);
      history.patchConversation(conversationId, { naviTrace });
    },
    onAssistantResponseComplete: (_fullText, meta) => {
      if (meta.sessionKind === "navi") {
        const conv = history.conversations.find(
          (c) => c.id === meta.conversationId,
        );
        if (conv?.simulationConfig) {
          import("./components/chat/simulationReplyKickoff.ts").then(
            ({ scheduleSimulationReply }) =>
              scheduleSimulationReply(meta.conversationId),
          );
        }
      }
    },
  });

  const [modesAndLlmLoadGeneration, setModesAndLlmLoadGeneration] = useState(0);
  const prefsHydratedRef = useRef(false);

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
      }
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

  // Keep the toolbar mode selector in sync with the active (navi) conversation.
  useEffect(() => {
    if (!history.hydrated || modes.length === 0) return;
    const conv = history.activeConversation;
    const desired =
      conv.mode && modes.some((m) => m.id === conv.mode)
        ? conv.mode
        : projectDefaultChatModeIdRef.current;
    if (desired !== selectedMode) {
      handleModeChange(desired, modes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    history.hydrated,
    history.activeId,
    history.activeConversation.mode,
    modes,
    modesAndLlmLoadGeneration,
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
    focusedFieldKey: undefined,
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
        naviFacts: conv.naviFacts,
        naviCoveredTips: conv.naviCoveredTips,
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

  useSimulationRunner({
    activeConversation: history.activeConversation,
    chatMessages: chat.messages,
    chatStreaming: chat.streaming,
    sendMessage: chat.sendMessage,
    selectedMode,
    modes,
    modeLlmId,
    useReasoning,
    disabledToolkits,
    rulesEnabled,
    openFile: () => {},
  });

  const modesForChat = useMemo(() => {
    const base = standardChatModes(modes);
    const cur = modes.find((m) => m.id === selectedMode);
    if (cur?.agentOnly && !base.some((m) => m.id === cur.id)) {
      return [...base, cur];
    }
    return base;
  }, [modes, selectedMode]);

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
    llms,
    naviConfigRef,
  });

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

  const handleSwitchChat = useCallback(
    (id: string) => {
      history.switchConversation(id);
    },
    [history],
  );

  const handleOpenProject = useCallback(
    async (path: string) => {
      await project.openProject(path);
      loadModes();
    },
    [project, loadModes],
  );

  const handleBrowseProject = useCallback(async () => {
    try {
      const result = await projectApi.browse();
      if (result?.path) {
        await handleOpenProject(result.path);
      }
    } catch (err) {
      console.error(err);
    }
  }, [handleOpenProject]);

  function conversationHasVisibleMessages(conv: Conversation): boolean {
    return conv.messages.some((m) => !m.hidden);
  }
  void conversationHasVisibleMessages;

  if (!project.projectPath) {
    return (
      <div className="app app-no-project">
        <div className="no-project-prompt">
          <FolderOpen size={32} />
          <p>Kein Projekt geöffnet.</p>
          <input
            className="new-chat-dialog-input"
            value={browsePathInput}
            onChange={(e) => setBrowsePathInput(e.target.value)}
            placeholder="Projektpfad eingeben…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && browsePathInput.trim()) {
                void handleOpenProject(browsePathInput.trim());
              }
            }}
          />
          <button type="button" onClick={handleBrowseProject}>
            Ordner auswählen…
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="navi-app-header">
        <span className="navi-app-project-path" title={project.projectPath}>
          {project.projectPath}
        </span>
        <button type="button" onClick={handleBrowseProject} title="Anderes Projekt öffnen">
          <FolderOpen size={14} />
        </button>
        <button type="button" onClick={() => setAppearanceOpen(true)} title="Darstellung">
          Darstellung
        </button>
      </div>
      <div className="app-panels navi-app-panels">
        <div className="navi-chat-column">
          <ChatPanel
            messages={conversation.messages}
            streaming={conversation.streaming}
            error={conversation.error}
            toolActivity={conversation.toolActivity}
            naviStep={chat.naviStepForCard}
            theme={preferences.appearance.theme === "light" ? "light" : "dark"}
            modes={modesForChat}
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
            activeSessionKind={history.activeConversation?.sessionKind ?? "navi"}
            naviStateId={history.activeConversation?.naviStateId ?? null}
            simulationConfig={history.activeConversation?.simulationConfig}
            onOpenSimulationSetup={() => setSimulationSetupOpen(true)}
            onSwitchChat={handleSwitchChat}
            onDeleteChat={history.deleteConversation}
            onRenameChat={history.renameConversation}
            onToggleSavedToProject={history.toggleSavedToProject}
            onClearAllBrowserChats={history.clearAllBrowserChats}
            clearAllBrowserChatsDisabled={!project.projectPath || !history.hydrated}
            activeSelection={activeSelection}
            onDismissSelection={handleDismissSelection}
            chatFocusTriggerRef={chatFocusTriggerRef}
            writeFileSettled={history.activeConversation?.writeFileSettled}
            onSettleSnapshots={(patch) => {
              history.settleWriteFileSnapshots(history.activeId, patch);
            }}
            onComposerDraftChange={handleComposerDraftChange}
            contextInfo={conversation.contextInfo}
            activeFile={null}
            isDirty={false}
            systemPromptPreview={conversation.systemPrompt}
            onFetchContextBlocks={conversation.fetchContextBlocks}
          />
        </div>

        <div className="navi-state-column">
          {history.activeConversation?.naviStateId && (
            <NaviStatePanel
              naviStateId={history.activeConversation.naviStateId}
              naviFacts={history.activeConversation.naviFacts}
              naviCoveredTips={history.activeConversation.naviCoveredTips}
              naviTrace={history.activeConversation.naviTrace}
            />
          )}
        </div>
      </div>

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
    </div>
  );
}

export default App;
