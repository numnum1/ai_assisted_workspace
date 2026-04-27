import { useState, useEffect, useCallback, useMemo } from "react";
import { History, Wand2, Pencil, Maximize2, Minimize2 } from "lucide-react";
import type {
  AgentPreset,
  ChatMessage,
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ChatSessionKind,
  ContextInfo,
} from "../../types.ts";
import { ModeSelector } from "./ModeSelector.tsx";
import { ChatHistory } from "./ChatHistory.tsx";
import { NewChatButton } from "./NewChatButton.tsx";
import { NewChatDialog, type NewChatConfirmPayload } from "./NewChatDialog.tsx";
import type { GuidedThreadOfferPayload } from "./guidedThreadOfferUtils.ts";
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
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  onModeChange: (mode: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onStartThreadFromMessage: (messageIndex: number) => void;
  onAcceptGuidedThreadOffer?: (
    assistantMessageIndex: number,
    payload: GuidedThreadOfferPayload,
  ) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onNewChat: (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => void;
  onDiscardCurrentChat: (
    kindOrPayload?: ChatSessionKind | NewChatConfirmPayload,
  ) => void;
  activeSessionKind?: ChatSessionKind;
  /** When true, the expand/fullscreen button opens the Thread-Workspace instead. */
  activeIsThread?: boolean;
  steeringPlan?: string;
  onMarkSteeringPlanComplete?: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onToggleSavedToProject: (id: string) => void;
  onClearAllBrowserChats?: () => void;
  clearAllBrowserChatsDisabled?: boolean;
  chatDownloadEnabled?: boolean;
  onOpenPromptPack?: () => void;
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
  agentPresets?: AgentPreset[];
  onComposerDraftChange?: (text: string) => void;
  theme?: "light" | "dark";
  onOpenThreadWorkspace?: () => void;
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
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  onModeChange,
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
  onForkToNewConversation,
  onStartThreadFromMessage,
  onAcceptGuidedThreadOffer,
  onEditMessage,
  onDeleteMessages,
  onNewChat,
  onDiscardCurrentChat,
  onSwitchChat,
  onDeleteChat,
  onRenameChat,
  onToggleSavedToProject,
  onClearAllBrowserChats,
  clearAllBrowserChatsDisabled = true,
  chatDownloadEnabled = false,
  onOpenPromptPack,
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
  agentPresets = [],
  activeSessionKind = "standard",
  steeringPlan = "",
  onMarkSteeringPlanComplete,
  activeIsThread = false,
  parentLastMessage = null,
  theme = "dark",
  onOpenThreadWorkspace,
  contextInfo,
  activeFile,
  isDirty,
  systemPromptPreview,
  onFetchContextBlocks,
}: ChatPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    setRenamingTitle(false);
  }, [activeConversationId]);

  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".chat-expand-overlay")) return;
      if (document.querySelector(".new-chat-dialog-overlay")) return;
      if (document.querySelector(".glossary-save-overlay")) return;
      setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const toggleChatFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

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
    <div className={`chat-panel${isFullscreen ? " chat-panel--expanded" : ""}`}>
      <div className="chat-header">
        {guidedExecSummary ? (
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
        ) : (
          <ModeSelector
            modes={modes}
            selectedMode={selectedMode}
            onModeChange={onModeChange}
            theme={theme}
          />
        )}
        <div className="chat-header-actions">
          {!guidedExecSummary && llms.length > 0 && onLlmChange && (
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
          {onOpenPromptPack && (
            <button
              type="button"
              className="chat-prompt-pack-btn"
              onClick={onOpenPromptPack}
              title="Prompt-Paket (Export für ChatGPT / Grok)"
            >
              <Wand2 size={14} />
            </button>
          )}
          <button
            type="button"
            className={`chat-history-btn ${isFullscreen ? "active" : ""}`}
            onClick={() => {
              if (activeIsThread && onOpenThreadWorkspace) {
                onOpenThreadWorkspace();
              } else {
                toggleChatFullscreen();
              }
            }}
            title={
              activeIsThread
                ? "Thread-Workspace öffnen"
                : isFullscreen
                  ? "Vergrößerte Ansicht schließen (Esc)"
                  : "Chat vergrößern"
            }
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
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
          onCreate={(sk) => onNewChat(sk ?? "standard")}
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
          onForkFromMessage={onForkFromMessage}
          onForkToNewConversation={onForkToNewConversation}
          onStartThreadFromMessage={onStartThreadFromMessage}
          onAcceptGuidedThreadOffer={onAcceptGuidedThreadOffer}
          onRetry={onRetry}
          referencedFiles={referencedFiles}
          onAddFile={onAddFile}
          onRemoveFile={onRemoveFile}
          onDraftChange={onComposerDraftChange}
          focusTriggerRef={chatFocusTriggerRef}
          useReasoning={useReasoning}
          onToggleReasoning={onToggleReasoning}
          disabledToolkits={disabledToolkits}
          onToggleToolkit={onToggleToolkit}
          reasoningAvailable={reasoningAvailable}
          fastAvailable={fastAvailable}
          activeSelection={activeSelection}
          onDismissSelection={onDismissSelection}
          activeSessionKind={activeSessionKind}
          steeringPlan={steeringPlan}
          onMarkSteeringPlanComplete={onMarkSteeringPlanComplete}
          onFileChanged={onFileChanged}
          writeFileSettled={writeFileSettled}
          onSettleSnapshots={onSettleSnapshots}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          onOpenPromptPack={onOpenPromptPack}
          contextInfo={contextInfo}
          activeFile={activeFile}
          isDirty={isDirty}
          systemPromptPreview={systemPromptPreview}
          onFetchContextBlocks={onFetchContextBlocks}
          structureRoot={structureRoot}
          theme={theme}
          fieldLabels={fieldLabels}
          fullscreen={isFullscreen}
          parentLastMessage={parentLastMessage}
        />
      </div>

      {newChatDialogOpen && (
        <NewChatDialog
          currentTitle={activeTitle}
          agentPresets={agentPresets}
          onConfirm={handleNewChatConfirm}
          onDiscard={handleNewChatDiscard}
          onCancel={() => setNewChatDialogOpen(false)}
        />
      )}
    </div>
  );
}
