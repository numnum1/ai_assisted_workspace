import {
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Minimize2, GitMerge } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import type {
  ChatMessage,
  ChatSessionKind,
  Conversation,
  ContextInfo,
  SelectionContext,
} from "../../types.ts";
import type { GuidedThreadOfferPayload } from "./guidedThreadOfferUtils.ts";
import {
  ThreadBranchPicker,
  type ThreadBranchItem,
} from "./ThreadBranchPicker.tsx";
import { ChatPane } from "./ChatPane.tsx";
import type { ContextBlock } from "./ContextBar.tsx";
import {
  loadChatThreadSplitLayout,
  saveChatThreadSplitLayout,
} from "./chatThreadSplitPanelLayout.ts";
import "./ChatThreadSplitResizable.css";

export interface ThreadWorkspacePanelProps {
  /** Thread conversation */
  threadConversationId: string;
  threadTitle: string;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;

  /** Parent conversation — full object for complete data access. */
  parentConversation: Conversation | null;
  parentMessages: ChatMessage[];
  parentStreaming: boolean;
  parentError?: string | null;

  /** Thread navigation */
  mainBranchItem: ThreadBranchItem;
  threadBranchItems: ThreadBranchItem[];
  onSwitchBranch: (id: string) => void;

  /** Close the workspace overlay */
  onClose: () => void;

  /** Summarize the thread and inject the result into the parent conversation */
  onSummarizeToParent?: () => Promise<void>;
  /** True while the summary LLM call is in progress */
  isSummarizing?: boolean;

  /** Thread message actions (right pane) */
  onSend: (message: string) => void;
  onStop: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onRetry?: () => void;

  /** Guided thread offer (right pane) */
  onAcceptGuidedThreadOffer?: (
    assistantMessageIndex: number,
    payload: GuidedThreadOfferPayload,
  ) => void;

  /** Parent message actions (left pane) */
  onSendToParent: (message: string) => void;
  onStopParent: () => void;
  onParentEditMessage: (index: number, content: string) => void;
  onParentDeleteMessages: (indices: number[]) => void;
  onParentForkFromMessage: (index: number) => void;
  onParentStartThreadFromMessage: (index: number) => void;
  onParentForkToNewConversation: (index: number) => void;
  onParentRetry?: () => void;
  onParentUpdateMessage?: (originalIdx: number, newContent: string) => void;

  /** File references */
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;

  /** Context */
  structureRoot?: string | null;
  theme: "light" | "dark";
  fieldLabels?: Record<string, string>;

  /** Guided / steering session */
  activeSessionKind?: ChatSessionKind;
  steeringPlan?: string;
  onMarkSteeringPlanComplete?: () => void;

  /** Write-file tool settle */
  onFileChanged?: (path: string) => void;
  onUpdateMessage?: (originalIdx: number, newContent: string) => void;

  /** Input extras */
  useReasoning?: boolean;
  onToggleReasoning?: () => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;

  /** Draft change callbacks — keep context preview in sync. */
  onThreadDraftChange?: (text: string) => void;
  onParentDraftChange?: (text: string) => void;

  /** ContextBar data for the thread pane. */
  threadContextInfo: ContextInfo | null;
  threadSystemPrompt?: string | null;
  onFetchThreadContextBlocks?: () => Promise<ContextBlock[]>;

  /** ContextBar data for the parent pane. */
  parentContextInfo: ContextInfo | null;
  parentSystemPrompt?: string | null;
  onFetchParentContextBlocks?: () => Promise<ContextBlock[]>;

  /** Shared file/dirty indicator for both ContextBars. */
  activeFile: string | null;
  isDirty: boolean;
}

export function ThreadWorkspacePanel({
  threadConversationId,
  threadTitle,
  messages,
  streaming,
  error,
  toolActivity,
  parentConversation,
  parentMessages,
  parentStreaming,
  parentError = null,
  mainBranchItem,
  threadBranchItems,
  onSwitchBranch,
  onClose,
  onSummarizeToParent,
  isSummarizing = false,
  onSend,
  onStop,
  onEditMessage,
  onDeleteMessages,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onRetry,
  onAcceptGuidedThreadOffer,
  onSendToParent,
  onStopParent,
  onParentEditMessage,
  onParentDeleteMessages,
  onParentForkFromMessage,
  onParentStartThreadFromMessage,
  onParentForkToNewConversation,
  onParentRetry,
  onParentUpdateMessage,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  structureRoot = null,
  theme,
  fieldLabels,
  activeSessionKind = "standard",
  steeringPlan = "",
  onMarkSteeringPlanComplete,
  onFileChanged,
  onUpdateMessage,
  useReasoning = false,
  onToggleReasoning,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  reasoningAvailable = true,
  fastAvailable = true,
  activeSelection = null,
  onDismissSelection,
  onThreadDraftChange,
  onParentDraftChange,
  threadContextInfo,
  threadSystemPrompt,
  onFetchThreadContextBlocks,
  parentContextInfo,
  parentSystemPrompt,
  onFetchParentContextBlocks,
  activeFile,
  isDirty,
}: ThreadWorkspacePanelProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".chat-expand-overlay")) return;
      if (document.querySelector(".new-chat-dialog-overlay")) return;
      if (document.querySelector(".glossary-save-overlay")) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const threadSplitDefaultLayout = useMemo(() => loadChatThreadSplitLayout(), []);
  const handleThreadSplitLayoutChanged = useCallback((layout: Layout) => {
    saveChatThreadSplitLayout(layout);
  }, []);

  return (
    <div className="chat-panel chat-panel--expanded chat-panel--thread-split">
      <div className="chat-header">
        <span className="chat-header-title" title={threadTitle}>
          {threadTitle}
        </span>
        <div className="chat-header-actions">
          {onSummarizeToParent && (
            <button
              type="button"
              className="chat-history-btn"
              onClick={() => { void onSummarizeToParent(); }}
              disabled={isSummarizing || !parentConversation}
              title="Zusammenfassung an Parent-Chat senden"
              aria-label="Zusammenfassung an Parent-Chat senden"
            >
              <GitMerge size={14} className={isSummarizing ? 'chat-history-btn--spinning' : undefined} />
            </button>
          )}
          <button
            type="button"
            className="chat-history-btn active"
            onClick={onClose}
            title="Thread-Workspace schließen (Esc)"
            aria-label="Thread-Workspace schließen"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      <div className="chat-panel-body chat-panel-body--thread-split">
        <Group
          orientation="horizontal"
          className="chat-thread-split-group"
          id="chat-thread-split-panels"
          defaultLayout={threadSplitDefaultLayout}
          onLayoutChanged={handleThreadSplitLayoutChanged}
        >
          <Panel
            id="chat-thread-split-picker"
            className="chat-thread-split-panel-shell"
            defaultSize="15%"
            minSize="10%"
            maxSize="48%"
          >
            <div className="chat-thread-split-picker">
              <ThreadBranchPicker
                main={mainBranchItem}
                threads={threadBranchItems}
                activeId={threadConversationId}
                onSelect={onSwitchBranch}
                ariaLabel="Thread / Branch wechseln (Git-Style)"
                showGraph={true}
                panel={true}
              />
            </div>
          </Panel>

          <Separator className="resize-handle" />

          <Panel
            id="chat-thread-split-left"
            className="chat-thread-split-panel-shell"
            defaultSize="38%"
            minSize="15%"
          >
            <div className="chat-thread-split-left">
              {parentConversation && (
                <div className="chat-thread-split-pane-header">
                  <span className="chat-thread-split-pane-label">Haupt-Chat</span>
                  <span
                    className="chat-thread-split-pane-title"
                    title={parentConversation.title}
                  >
                    {parentConversation.title}
                  </span>
                </div>
              )}
              <ChatPane
                key={parentConversation?.id ?? "parent"}
                conversationId={parentConversation?.id ?? ""}
                isThread={parentConversation?.isThread === true}
                messages={parentMessages}
                streaming={parentStreaming}
                error={parentError}
                toolActivity={null}
                onSend={onSendToParent}
                onStop={onStopParent}
                onEditMessage={onParentEditMessage}
                onDeleteMessages={onParentDeleteMessages}
                onForkFromMessage={onParentForkFromMessage}
                onStartThreadFromMessage={onParentStartThreadFromMessage}
                onForkToNewConversation={onParentForkToNewConversation}
                onRetry={onParentRetry}
                onUpdateMessage={onParentUpdateMessage}
                referencedFiles={referencedFiles}
                onAddFile={onAddFile}
                onRemoveFile={onRemoveFile}
                onDraftChange={onParentDraftChange}
                useReasoning={useReasoning}
                onToggleReasoning={onToggleReasoning}
                disabledToolkits={disabledToolkits}
                onToggleToolkit={onToggleToolkit}
                reasoningAvailable={reasoningAvailable}
                fastAvailable={fastAvailable}
                structureRoot={structureRoot}
                theme={theme}
                fieldLabels={fieldLabels}
                fullscreen={true}
                contextInfo={parentContextInfo}
                activeFile={activeFile}
                isDirty={isDirty}
                systemPromptPreview={parentSystemPrompt}
                onFetchContextBlocks={onFetchParentContextBlocks}
              />
            </div>
          </Panel>

          <Separator className="resize-handle" />

          <Panel
            id="chat-thread-split-right"
            className="chat-thread-split-panel-shell"
            defaultSize="47%"
            minSize="22%"
          >
            <div className="chat-thread-split-right">
              <ChatPane
                conversationId={threadConversationId}
                isThread={true}
                messages={messages}
                streaming={streaming}
                error={error}
                toolActivity={toolActivity}
                onSend={onSend}
                onStop={onStop}
                onEditMessage={onEditMessage}
                onDeleteMessages={onDeleteMessages}
                onForkFromMessage={onForkFromMessage}
                onStartThreadFromMessage={onStartThreadFromMessage}
                onForkToNewConversation={onForkToNewConversation}
                onRetry={onRetry}
                onAcceptGuidedThreadOffer={onAcceptGuidedThreadOffer}
                referencedFiles={referencedFiles}
                onAddFile={onAddFile}
                onRemoveFile={onRemoveFile}
                onDraftChange={onThreadDraftChange}
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
                onUpdateMessage={onUpdateMessage}
                structureRoot={structureRoot}
                theme={theme}
                fieldLabels={fieldLabels}
                fullscreen={true}
                contextInfo={threadContextInfo}
                activeFile={activeFile}
                isDirty={isDirty}
                systemPromptPreview={threadSystemPrompt}
                onFetchContextBlocks={onFetchThreadContextBlocks}
              />
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
