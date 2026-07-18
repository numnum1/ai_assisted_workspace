import { useCallback, useEffect, useState } from "react";
import { projectApi, windowApi } from "./api.ts";
import { usePreferences } from "./hooks/usePreferences.ts";
import { useAppearanceCss } from "./hooks/useAppearanceCss.ts";
import {
  useChatModeToolbar,
  useSyncChatModeWithHistory,
} from "./hooks/useChatModeToolbar.ts";
import { useChatHistory } from "./hooks/useChatHistory.ts";
import { useChat } from "./hooks/useChat.ts";
import { ChatPanel } from "./components/chat/ChatPanel.tsx";
import type { ClarificationData } from "./types.ts";

/**
 * Root of the standalone KI-Chat window (loaded with `?window=chat`). It rebuilds
 * the main project chat from the shared hooks (`useChatModeToolbar`,
 * `useChatHistory`, `useChat`) and renders {@link ChatPanel}. The open project
 * comes from the main-process singleton and is refreshed on `workspace:changed`,
 * so no project-selection UI is needed. Editor-/selection-bound props are absent
 * because this window has no editor.
 */
export function ChatWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  const [projectPath, setProjectPath] = useState<string | null>(null);
  useEffect(() => {
    const load = () => {
      projectApi
        .current()
        .then((p) => setProjectPath(p.hasProject ? p.path : null))
        .catch(() => setProjectPath(null));
    };
    load();
    return windowApi.onWorkspaceChanged(load);
  }, []);

  const toolbar = useChatModeToolbar(projectPath);
  const {
    modes,
    selectedMode,
    useReasoning,
    setUseReasoning,
    reasoningEffort,
    setReasoningEffort,
    modeLlmId,
    setModeLlmId,
    llms,
    disabledToolkits,
    setDisabledToolkits,
    rulesEnabled,
    setRulesEnabled,
    handleModeChange,
  } = toolbar;

  const history = useChatHistory(selectedMode, projectPath ?? "");
  const chat = useChat(history.updateMessages);
  useSyncChatModeWithHistory(toolbar, history, projectPath);

  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const handleAddFile = useCallback((path: string) => {
    setReferencedFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);
  const handleRemoveFile = useCallback((path: string) => {
    setReferencedFiles((prev) => prev.filter((p) => p !== path));
  }, []);

  const handleSend = useCallback(
    (text: string, clarificationData?: ClarificationData) => {
      const mode = modes.find((m) => m.id === selectedMode);
      chat.sendMessage(
        text,
        selectedMode,
        referencedFiles,
        mode?.name,
        mode?.color,
        useReasoning,
        modeLlmId,
        undefined,
        null,
        disabledToolkits.size > 0 ? [...disabledToolkits] : undefined,
        {
          ...(clarificationData ? { clarificationData } : {}),
          ...(rulesEnabled ? {} : { rulesDisabled: true }),
          reasoningEffort,
        },
      );
    },
    [
      modes,
      selectedMode,
      referencedFiles,
      useReasoning,
      modeLlmId,
      disabledToolkits,
      rulesEnabled,
      reasoningEffort,
      chat,
    ],
  );

  const handleEditMessage = useCallback(
    (index: number, newContent: string) => {
      chat.editMessage(index, newContent, {
        mode: selectedMode,
        referencedFiles,
        useReasoning,
        reasoningEffort,
        llmId: modeLlmId,
        disabledToolkits:
          disabledToolkits.size > 0 ? [...disabledToolkits] : undefined,
        conversationId: history.activeId,
        rulesDisabled: !rulesEnabled,
      });
    },
    [
      chat,
      selectedMode,
      referencedFiles,
      useReasoning,
      reasoningEffort,
      modeLlmId,
      disabledToolkits,
      history.activeId,
      rulesEnabled,
    ],
  );

  const handleToggleToolkit = useCallback(
    (kitId: string) => {
      setDisabledToolkits((prev) => {
        const next = new Set(prev);
        if (next.has(kitId)) next.delete(kitId);
        else next.add(kitId);
        return next;
      });
    },
    [setDisabledToolkits],
  );

  const handleForkToNewConversation = useCallback(
    (index: number) => {
      history.createConversation(selectedMode, chat.messages.slice(0, index + 1));
    },
    [history, selectedMode, chat.messages],
  );

  const handleToggleReasoning = useCallback(
    () => setUseReasoning((v) => !v),
    [setUseReasoning],
  );
  const handleToggleRules = useCallback(
    () => setRulesEnabled((v) => !v),
    [setRulesEnabled],
  );
  const handleNewChat = useCallback(
    (title?: string) => history.createConversation(selectedMode, undefined, title),
    [history, selectedMode],
  );
  const handleDiscardCurrentChat = useCallback(
    (title?: string) =>
      history.discardActiveAndCreateConversation(selectedMode, title),
    [history, selectedMode],
  );
  const handleSettleSnapshots = useCallback(
    (patch: Record<string, "applied" | "reverted">) => {
      history.settleWriteFileSnapshots(history.activeId, patch);
    },
    [history],
  );
  const handleOpenStoryboard = useCallback(() => {
    void windowApi.open("storyboard");
  }, []);

  return (
    <ChatPanel
      messages={chat.messages}
      streaming={chat.streaming}
      error={chat.error}
      toolActivity={chat.toolActivity}
      modes={modes}
      selectedMode={selectedMode}
      referencedFiles={referencedFiles}
      conversations={history.conversations}
      activeConversationId={history.activeId}
      useReasoning={useReasoning}
      onToggleReasoning={handleToggleReasoning}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={setReasoningEffort}
      disabledToolkits={disabledToolkits}
      onToggleToolkit={handleToggleToolkit}
      rulesEnabled={rulesEnabled}
      onToggleRules={handleToggleRules}
      onModeChange={handleModeChange}
      onSend={handleSend}
      onStop={chat.stopStreaming}
      onAddFile={handleAddFile}
      onRemoveFile={handleRemoveFile}
      onForkFromMessage={chat.forkFromMessage}
      onForkToNewConversation={handleForkToNewConversation}
      onStartThreadFromMessage={handleForkToNewConversation}
      onEditMessage={handleEditMessage}
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
      onOpenStoryboard={handleOpenStoryboard}
      structureRoot={projectPath}
      onRetry={chat.retry}
      writeFileSettled={history.activeConversation?.writeFileSettled}
      onSettleSnapshots={handleSettleSnapshots}
      llms={llms}
      selectedLlmId={modeLlmId}
      onLlmChange={setModeLlmId}
      theme={preferences.appearance.theme === "light" ? "light" : "dark"}
      contextInfo={chat.contextInfo}
      activeFile={null}
      isDirty={false}
    />
  );
}
