import { useState, useMemo } from "react";
import { GitMerge, Loader2, Waypoints } from "lucide-react";
import type {
  ChatMessage,
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ChatSessionKind,
  ContextInfo,
  MessageFeedback,
  ReasoningEffort,
  SimulationConfig,
} from "../../types.ts";
import { ChatHistory } from "./ChatHistory.tsx";
import { NewChatButton } from "./NewChatButton.tsx";
import { NewChatDialog, type NewChatConfirmPayload } from "./NewChatDialog.tsx";
import { ChatPane } from "./ChatPane.tsx";
import type { ContextBlock } from "./ContextBar.tsx";

function resolveGuidedExecutionSummary(
  modes: Mode[],
  selectedMode: string,
  llms: LlmPublic[],
  selectedLlmId: string | undefined,
): { modeLabel: string; llmLabel: string } {
  const modeLabel =
    modes.find((m) => m.id === selectedMode)?.name ?? selectedMode;
  const lid = selectedLlmId?.trim();
  const llmLabel = lid
    ? (llms.find((l) => l.id === lid)?.name ?? lid)
    : "Standard";
  return { modeLabel, llmLabel };
}

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  modes: Mode[];
  selectedMode: string;
  referencedFiles: string[];
  conversations: Conversation[];
  activeConversationId: string;
  useReasoning: boolean;
  onToggleReasoning: () => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  rulesEnabled?: boolean;
  onToggleRules?: () => void;
  onModeChange: (mode: string) => void;
  onSend: (message: string, clarificationData?: { questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>; selected: Record<number, string[]> }) => void;
  onStop: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onStartThreadFromMessage: (messageIndex: number) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onNewChat: (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => void;
  onDiscardCurrentChat: (
    kindOrPayload?: ChatSessionKind | NewChatConfirmPayload,
  ) => void;
  activeSessionKind?: ChatSessionKind;
  /** When true, the expand/fullscreen button opens the Thread-Workspace instead. */
  activeIsThread?: boolean;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onClearAllBrowserChats?: () => void;
  clearAllBrowserChatsDisabled?: boolean;
  chatDownloadEnabled?: boolean;
  /** Opens the arc timeline workspace (story/character/relationship arcs). */
  onOpenArcs?: () => void;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  chatFocusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  llms?: LlmPublic[];
  selectedLlmId?: string;
  onLlmChange?: (id: string | undefined) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  onRetry?: () => void;
  onComposerDraftChange?: (text: string) => void;
  theme?: "light" | "dark";
  /** Summarize thread and merge result into parent conversation (only when activeIsThread is true). */
  onSummarizeToParent?: (focusInstructions?: string) => Promise<void> | void;
  isSummarizing?: boolean;
  /** Last visible message from the parent conversation (when activeIsThread is true). */
  parentLastMessage?: ChatMessage | null;
  /** ContextBar data — one per chat instance. */
  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview?: string | null;
  onFetchContextBlocks?: () => Promise<ContextBlock[]>;
  naviStateId?: string | null;
  naviStep?: string | null;
  simulationConfig?: SimulationConfig;
  onOpenSimulationSetup?: () => void;
}

export function ChatPanel({
  messages,
  streaming,
  error,
  toolActivity,
  modes,
  selectedMode,
  referencedFiles,
  conversations,
  activeConversationId,
  useReasoning,
  onToggleReasoning,
  reasoningEffort = "medium",
  onReasoningEffortChange,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  rulesEnabled = true,
  onToggleRules,
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
  onForkToNewConversation,
  onStartThreadFromMessage,
  onEditMessage,
  onDeleteMessages,
  onSetMessageFeedback,
  onNewChat,
  onDiscardCurrentChat,
  onSwitchChat,
  onDeleteChat,
  onRenameChat,
  onClearAllBrowserChats,
  clearAllBrowserChatsDisabled = true,
  chatDownloadEnabled = false,
  onOpenArcs,
  activeSelection = null,
  onDismissSelection,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  chatFocusTriggerRef,
  llms = [],
  selectedLlmId,
  reasoningAvailable = true,
  fastAvailable = true,
  onRetry,
  onComposerDraftChange,
  activeSessionKind = "standard",
  activeIsThread = false,
  parentLastMessage = null,
  theme = "dark",
  onSummarizeToParent,
  isSummarizing = false,
  contextInfo,
  activeFile,
  isDirty,
  systemPromptPreview,
  onFetchContextBlocks,
  naviStateId,
  naviStep,
  simulationConfig,
}: ChatPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);

  const activeTitle =
    conversations.find((c) => c.id === activeConversationId)?.title ?? "";

  const handleNewChatClick = () => {
    setNewChatDialogOpen(true);
  };

  const handleNewChatConfirm = (payload: NewChatConfirmPayload) => {
    setNewChatDialogOpen(false);
    if (payload.title.trim() && payload.title.trim() !== activeTitle) {
      onRenameChat(activeConversationId, payload.title.trim());
    }
    onNewChat(payload);
  };

  const handleNewChatDiscard = (payload: NewChatConfirmPayload) => {
    setNewChatDialogOpen(false);
    onDiscardCurrentChat(payload);
  };

  /** Guided header must match persisted conversation (agent preset), not global toolbar state. */
  const guidedExecSummary = useMemo(() => {
    if (activeSessionKind !== "guided") return null;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) {
      return resolveGuidedExecutionSummary(
        modes,
        selectedMode,
        llms,
        selectedLlmId,
      );
    }
    const llmForLabel =
      conv.agentLlmId !== undefined ? conv.agentLlmId : selectedLlmId;
    return resolveGuidedExecutionSummary(modes, conv.mode, llms, llmForLabel);
  }, [
    activeSessionKind,
    conversations,
    activeConversationId,
    modes,
    selectedMode,
    llms,
    selectedLlmId,
  ]);

  return (
    <div className="chat-panel">
      <div className="chat-header-actions">
        {onOpenArcs && (
          <button
            type="button"
            className="chat-history-btn"
            onClick={onOpenArcs}
            title="Spannungsbögen öffnen (Strg+Shift+B) — Story-/Figuren-/Beziehungsbögen"
          >
            <Waypoints size={14} />
          </button>
        )}
        {activeIsThread && onSummarizeToParent && (
          <button
            type="button"
            className="chat-history-btn"
            onClick={() => void onSummarizeToParent()}
            disabled={isSummarizing}
            title="Zusammenfassen & zum Haupt-Chat"
          >
            {isSummarizing ? <Loader2 size={14} className="chat-btn-spin" /> : <GitMerge size={14} />}
          </button>
        )}
        <NewChatButton onClick={handleNewChatClick} />
      </div>

      {guidedExecSummary && (
        <div className="chat-header">
          <div
            className="chat-guided-execution-summary"
            role="status"
            aria-label={`Geführte Sitzung: Modus ${guidedExecSummary.modeLabel}, LLM ${guidedExecSummary.llmLabel}`}
            title={`Modus: ${guidedExecSummary.modeLabel} — LLM: ${guidedExecSummary.llmLabel}`}
          >
            <span className="chat-guided-execution-summary-text">
              {guidedExecSummary.modeLabel}
              <span className="chat-guided-execution-sep" aria-hidden>
                {" "}
                ·{" "}
              </span>
              {guidedExecSummary.llmLabel}
            </span>
          </div>
        </div>
      )}

      {historyOpen && (
        <ChatHistory
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={onSwitchChat}
          onCreate={(sk) => onNewChat(sk ?? "standard")}
          onDelete={onDeleteChat}
          onRename={onRenameChat}
          onClearAllBrowserChats={onClearAllBrowserChats}
          clearAllBrowserDisabled={clearAllBrowserChatsDisabled}
          chatDownloadEnabled={chatDownloadEnabled}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className="chat-panel-body">
        <ChatPane
          conversationId={activeConversationId}
          isThread={activeIsThread}
          messages={messages}
          streaming={streaming}
          error={error}
          toolActivity={toolActivity}
          naviStep={naviStep}
          naviStateId={naviStateId}
          onSend={onSend}
          onStop={onStop}
          onEditMessage={onEditMessage}
          onDeleteMessages={onDeleteMessages}
          onSetMessageFeedback={onSetMessageFeedback}
          onForkFromMessage={onForkFromMessage}
          onForkToNewConversation={onForkToNewConversation}
          onStartThreadFromMessage={onStartThreadFromMessage}
          onRetry={onRetry}
          referencedFiles={referencedFiles}
          onAddFile={onAddFile}
          onRemoveFile={onRemoveFile}
          onDraftChange={onComposerDraftChange}
          focusTriggerRef={chatFocusTriggerRef}
          useReasoning={useReasoning}
          onToggleReasoning={onToggleReasoning}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={onReasoningEffortChange}
          disabledToolkits={disabledToolkits}
          onToggleToolkit={onToggleToolkit}
          rulesEnabled={rulesEnabled}
          onToggleRules={onToggleRules}
          reasoningAvailable={reasoningAvailable}
          fastAvailable={fastAvailable}
          activeSelection={activeSelection}
          onDismissSelection={onDismissSelection}
          activeSessionKind={activeSessionKind}
          simulationConfig={simulationConfig}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          contextInfo={contextInfo}
          activeFile={activeFile}
          isDirty={isDirty}
          systemPromptPreview={systemPromptPreview}
          onFetchContextBlocks={onFetchContextBlocks}
          theme={theme}
          fieldLabels={fieldLabels}
          parentLastMessage={parentLastMessage}
        />
      </div>

      {newChatDialogOpen && (
        <NewChatDialog
          currentTitle={activeTitle}
          onConfirm={handleNewChatConfirm}
          onDiscard={handleNewChatDiscard}
          onCancel={() => setNewChatDialogOpen(false)}
        />
      )}
    </div>
  );
}
