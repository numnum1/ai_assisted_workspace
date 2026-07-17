import { useState, useEffect } from "react";
import { History, Pencil, GitMerge, Loader2, Waypoints } from "lucide-react";
import type {
  ChatMessage,
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ContextInfo,
  MessageFeedback,
  ReasoningEffort,
  ClarificationData,
} from "../../types.ts";
import { ModeSelector } from "./ModeSelector.tsx";
import { ChatHistory } from "./ChatHistory.tsx";
import { NewChatButton } from "./NewChatButton.tsx";
import { NewChatDialog, type NewChatConfirmPayload } from "./NewChatDialog.tsx";
import { ChatPane } from "./ChatPane.tsx";
import type { ContextBlock } from "./ContextBar.tsx";

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
  onSend: (message: string, clarificationData?: ClarificationData) => void;
  onStop: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onStartThreadFromMessage: (messageIndex: number) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onNewChat: (title?: string) => void;
  onDiscardCurrentChat: (title?: string) => void;
  /** When true, the expand/fullscreen button opens the Thread-Workspace instead. */
  activeIsThread?: boolean;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onToggleSavedToProject: (id: string) => void;
  onClearAllBrowserChats?: () => void;
  clearAllBrowserChatsDisabled?: boolean;
  chatDownloadEnabled?: boolean;
  /** Opens the arc timeline workspace (story/character/relationship arcs). */
  onOpenArcs?: () => void;
  structureRoot?: string | null;
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
  onFileChanged?: (path: string) => void;
  writeFileSettled?: Record<string, "applied" | "reverted">;
  onSettleSnapshots?: (patch: Record<string, "applied" | "reverted">) => void;
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
  onModeChange,
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
  onToggleSavedToProject,
  onClearAllBrowserChats,
  clearAllBrowserChatsDisabled = true,
  chatDownloadEnabled = false,
  onOpenArcs,
  structureRoot = null,
  activeSelection = null,
  onDismissSelection,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  chatFocusTriggerRef,
  llms = [],
  selectedLlmId,
  onLlmChange,
  reasoningAvailable = true,
  fastAvailable = true,
  onRetry,
  onFileChanged,
  writeFileSettled,
  onSettleSnapshots,
  onComposerDraftChange,
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
}: ChatPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    setRenamingTitle(false);
  }, [activeConversationId]);

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
    onNewChat(payload.newTitle);
  };

  const handleNewChatDiscard = (payload: NewChatConfirmPayload) => {
    setNewChatDialogOpen(false);
    onDiscardCurrentChat(payload.newTitle);
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <ModeSelector
          modes={modes}
          selectedMode={selectedMode}
          onModeChange={onModeChange}
          theme={theme}
        />
        <div className="chat-header-actions">
          {llms.length > 0 && onLlmChange && (
            <select
              className="chat-llm-select"
              value={selectedLlmId ?? ""}
              onChange={(e) => onLlmChange(e.target.value || undefined)}
              title="LLM auswählen"
            >
              <option value="">— Standard —</option>
              {llms.map((llm) => (
                <option key={llm.id} value={llm.id}>
                  {llm.name}
                </option>
              ))}
            </select>
          )}
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
          <button
            className={`chat-history-btn ${historyOpen ? "active" : ""}`}
            onClick={() => setHistoryOpen((prev) => !prev)}
            title="Chat-Historie"
          >
            <History size={14} />
          </button>
          <NewChatButton onClick={handleNewChatClick} />
        </div>
        <div className="chat-header-title-row">
          {renamingTitle ? (
            <input
              className="chat-header-rename-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                onRenameChat(activeConversationId, titleDraft);
                setRenamingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameChat(activeConversationId, titleDraft);
                  setRenamingTitle(false);
                }
                if (e.key === "Escape") setRenamingTitle(false);
              }}
              autoFocus
            />
          ) : (
            <span className="chat-header-title" title={activeTitle}>
              {activeTitle}
            </span>
          )}
          <button
            className="chat-header-rename-btn"
            onClick={() => {
              setTitleDraft(activeTitle);
              setRenamingTitle(true);
            }}
            title="Chat umbenennen"
          >
            <Pencil size={11} />
          </button>
        </div>
      </div>

      {historyOpen && (
        <ChatHistory
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={onSwitchChat}
          onCreate={onNewChat}
          onDelete={onDeleteChat}
          onRename={onRenameChat}
          onToggleSavedToProject={onToggleSavedToProject}
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
          onFileChanged={onFileChanged}
          writeFileSettled={writeFileSettled}
          onSettleSnapshots={onSettleSnapshots}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          contextInfo={contextInfo}
          activeFile={activeFile}
          isDirty={isDirty}
          systemPromptPreview={systemPromptPreview}
          onFetchContextBlocks={onFetchContextBlocks}
          structureRoot={structureRoot}
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
