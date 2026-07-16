import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChatPanel } from "./components/chat/ChatPanel.tsx";
import { NaviStatePanel } from "./components/chat/NaviStatePanel.tsx";
import {
  SimulationSetupModal,
  type SimulationSetupResult,
} from "./components/simulation/SimulationSetupModal.tsx";
import { AppearanceModal } from "./components/settings/AppearanceModal.tsx";
import type {
  Conversation,
  SelectionContext,
  LlmPublic,
  ReasoningEffort,
} from "./types.ts";
import { llmApi } from "./api.ts";
import { NAVI_MODES } from "./naviConfig.ts";

import { usePreferences } from "./hooks/usePreferences.ts";
import { useChat } from "./hooks/useChat.ts";
import { useReferencedFiles } from "./hooks/useContext.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useSimulationRunner } from "./hooks/useSimulationRunner.ts";
import { useConversationActions } from "./hooks/useConversationActions.ts";
import { useConversationModel } from "./hooks/useConversationModel.ts";
import {
  buildNaviConversationPatch,
} from "./components/chat/chatAgentUtils.ts";
import { standardChatModes } from "./components/chat/effectiveChatModeForRequest.ts";
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

const NAVI_MODE_ID = NAVI_MODES[0].id;

function App() {
  const refs = useReferencedFiles();
  const { preferences, updatePreferences } = usePreferences();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const modes = NAVI_MODES;
  const [simulationSetupOpen, setSimulationSetupOpen] = useState(false);
  const [selectedMode] = useState(NAVI_MODE_ID);
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

  const history = useChatHistory(selectedMode);
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

  const prefsHydratedRef = useRef(false);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  useEffect(() => {
    prefsHydratedRef.current = false;
    let cancelled = false;
    llmApi
      .list()
      .then((r) => {
        if (cancelled) return;
        setLlms(r.providers);
        llmsRef.current = r.providers;
        prefsHydratedRef.current = true;
        applyLlmPrefsFromStorage();
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [applyLlmPrefsFromStorage]);

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setAppearanceOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const mainChatComposerDraftRef = useRef("");

  useEffect(() => {
    mainChatComposerDraftRef.current = "";
  }, [history.activeId]);

  const conversation = useConversationModel({
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

  const handleComposerDraftChange = useCallback((text: string) => {
    mainChatComposerDraftRef.current = text;
  }, []);

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
    appendMessageToConversation: history.appendMessageToConversation,
  });

  const modesForChat = useMemo(() => standardChatModes(modes), [modes]);

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
  });

  const handleCreateSimulation = useCallback(
    async (result: SimulationSetupResult) => {
      setSimulationSetupOpen(false);
      const { title, simulationConfig } = result;
      const newConv = history.createConversation(selectedMode, undefined, title, "navi");
      history.patchConversation(newConv.id, {
        simulationConfig,
        ...buildNaviConversationPatch({}, modes, llms),
      });
      scheduleNaviGreetingKickoff(newConv.id);
    },
    [history, selectedMode, modes, llms],
  );

  const handleSwitchChat = useCallback(
    (id: string) => {
      history.switchConversation(id);
    },
    [history],
  );

  function conversationHasVisibleMessages(conv: Conversation): boolean {
    return conv.messages.some((m) => !m.hidden);
  }
  void conversationHasVisibleMessages;

  const handleModeChange = useCallback(() => {
    // Only one mode ("navi") exists — nothing to switch.
  }, []);

  return (
    <div className="app">
      <div className="app-panels navi-app-panels">
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
            onClearAllBrowserChats={history.clearAllBrowserChats}
            clearAllBrowserChatsDisabled={!history.hydrated}
            activeSelection={activeSelection}
            onDismissSelection={handleDismissSelection}
            chatFocusTriggerRef={chatFocusTriggerRef}
            onComposerDraftChange={handleComposerDraftChange}
          />
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
