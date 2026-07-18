import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type {
  ChatMessage,
  SelectionContext,
  ContextInfo,
  MessageFeedback,
  ReasoningEffort,
} from "../../types.ts";
import { ChatInput } from "./ChatInput.tsx";
import { ChatComposerCard } from "./ChatComposerCard.tsx";
import { SuggestedActionsCard } from "./SuggestedActionsCard.tsx";
import { YesNoCard } from "./YesNoCard.tsx";
import { parseClarificationQuestions, parseYesNoQuestion } from "./clarificationUtils.ts";
import type { CardState } from "./ChangeCard.tsx";
import { ChatMessagesPane } from "./ChatMessagesPane.tsx";
import { WriteFileBatchComposerBar } from "./WriteFileBatchComposerBar.tsx";
import {
  collectAllWriteFileItems,
  getTrailingWriteFileBatch,
} from "./writeFileBatchUtils.ts";
import { ContextBar, type ContextBlock } from "./ContextBar.tsx";
import "./ChatPane.css";

/** Chars above which auto-scroll stops following during streaming. */
const AUTOSCROLL_CHAR_LIMIT = 1500;

export interface ChatPaneProps {
  /** Conversation identity — drives state reset on switch. */
  conversationId: string;
  /** True when this conversation is a thread. Data fact only, not a UI gate. */
  isThread: boolean;

  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;

  onSend: (message: string, clarificationData?: { questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>; selected: Record<number, string[]> }) => void;
  onStop: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onStartThreadFromMessage: (messageIndex: number) => void;
  onUseMessageAsThreadSummary?: (index: number) => void;
  onRetry?: () => void;

  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;

  onDraftChange?: (text: string) => void;
  focusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  useReasoning?: boolean;
  onToggleReasoning?: () => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  rulesEnabled?: boolean;
  onToggleRules?: () => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;

  onFileChanged?: (path: string) => void;
  /** Persisted settled state for write_file snapshots (from Conversation.writeFileSettled). */
  writeFileSettled?: Record<string, "applied" | "reverted">;
  /** Called when snapshots are settled so the state can be persisted to the conversation. */
  onSettleSnapshots?: (patch: Record<string, "applied" | "reverted">) => void;

  /** Glossary toolkit support (optional). */
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;

  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview?: string | null;
  onFetchContextBlocks?: () => Promise<ContextBlock[]>;

  structureRoot?: string | null;
  theme?: "light" | "dark";
  fieldLabels?: Record<string, string>;
  /** When this is a thread: the last visible message from the parent conversation to show as context banner. */
  parentLastMessage?: ChatMessage | null;
}

export function ChatPane({
  conversationId,
  isThread,
  messages,
  streaming,
  error,
  toolActivity,
  onSend,
  onStop,
  onEditMessage,
  onDeleteMessages,
  onSetMessageFeedback,
  onForkFromMessage,
  onForkToNewConversation,
  onStartThreadFromMessage,
  onUseMessageAsThreadSummary,
  onRetry,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  onDraftChange,
  focusTriggerRef,
  useReasoning = false,
  onToggleReasoning,
  reasoningEffort = "medium",
  onReasoningEffortChange,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  rulesEnabled = true,
  onToggleRules,
  reasoningAvailable = true,
  fastAvailable = true,
  activeSelection = null,
  onDismissSelection,
  onFileChanged,
  writeFileSettled,
  onSettleSnapshots,
  onReplaceSelection,
  onApplyFieldUpdate,
  contextInfo,
  activeFile,
  isDirty,
  systemPromptPreview,
  onFetchContextBlocks,
  structureRoot = null,
  theme = "dark",
  fieldLabels,
  parentLastMessage = null,
}: ChatPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<"user" | "assistant" | undefined>(
    undefined,
  );
  const prevStreamingRef = useRef(false);
  const autoScrollActiveRef = useRef(true);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [composerBatchForced, setComposerBatchForced] = useState<
    Record<string, CardState>
  >({});
  const [toolbarSettledIds, setToolbarSettledIds] = useState(
    () => new Set<string>(),
  );
  const [bulkDismissIds, setBulkDismissIds] = useState(() => new Set<string>());
  const [clarificationOtherOpen, setClarificationOtherOpen] = useState(false);

  // Reset all per-conversation state on conversation switch
  useEffect(() => {
    setComposerBatchForced({});
    setToolbarSettledIds(new Set());
    setBulkDismissIds(new Set());
    setEditingIdx(null);
    setClarificationOtherOpen(false);
    autoScrollActiveRef.current = true;
    prevLastVisibleRoleRef.current = undefined;
  }, [conversationId]);

  // Scroll to bottom when conversation switches or messages first load
  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, [conversationId, messages.length]);

  useEffect(() => {
    prevLastVisibleRoleRef.current = undefined;
    autoScrollActiveRef.current = true;
  }, [conversationId]);

  // Re-enable follow-scroll when a new stream starts
  useEffect(() => {
    if (streaming && !prevStreamingRef.current) {
      autoScrollActiveRef.current = true;
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  // Scroll to bottom on new user message
  useEffect(() => {
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    const role =
      last?.role === "user"
        ? "user"
        : last?.role === "assistant"
          ? "assistant"
          : undefined;
    const prev = prevLastVisibleRoleRef.current;
    if (role === "user" && prev !== "user") {
      const el = messagesScrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevLastVisibleRoleRef.current = role;
  }, [messages]);

  // Auto-scroll during streaming for small/medium replies
  useEffect(() => {
    if (!streaming) return;
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    if (!last || last.role !== "assistant") return;
    if (!autoScrollActiveRef.current) return;
    if (last.content.length > AUTOSCROLL_CHAR_LIMIT) {
      autoScrollActiveRef.current = false;
      return;
    }
    const el = messagesScrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, streaming]);

  // Disable follow-scroll when user scrolls away from bottom during streaming
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || !streaming) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 60) {
        autoScrollActiveRef.current = false;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [streaming]);

  const visibleEntries = useMemo(
    () =>
      messages
        .map((msg, originalIdx) => ({ msg, originalIdx }))
        .filter(({ msg }) => !msg.hidden),
    [messages],
  );

  const trailingWriteFileBatch = useMemo(
    () => getTrailingWriteFileBatch(visibleEntries, writeFileSettled),
    [visibleEntries, writeFileSettled],
  );
  const composerBatchKey =
    trailingWriteFileBatch?.map((i) => i.data.snapshotId).join("\0") ?? "";

  useEffect(() => {
    setComposerBatchForced({});
  }, [composerBatchKey]);

  const allWriteFileItems = useMemo(
    () => collectAllWriteFileItems(visibleEntries, writeFileSettled),
    [visibleEntries, writeFileSettled],
  );
  const pendingWriteFileItems = useMemo(
    () =>
      allWriteFileItems.filter(
        (i) => !toolbarSettledIds.has(i.data.snapshotId),
      ),
    [allWriteFileItems, toolbarSettledIds],
  );

  const mergeComposerBatchForced = useCallback(
    (patch: Record<string, CardState>) => {
      setComposerBatchForced((p) => ({ ...p, ...patch }));
    },
    [],
  );

  const handleSnapshotSettled = useCallback(
    (snapshotId: string, state: "applied" | "reverted" | "dismissed") => {
      setToolbarSettledIds((prev) => new Set(prev).add(snapshotId));
      if (state === "applied" || state === "reverted") {
        onSettleSnapshots?.({ [snapshotId]: state });
      }
    },
    [onSettleSnapshots],
  );

  const handleWriteFileBulkComplete = useCallback(
    (patch: Record<string, CardState>) => {
      mergeComposerBatchForced(patch);
      const ids = Object.keys(patch);
      if (ids.length === 0) return;
      setToolbarSettledIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.add(id));
        return n;
      });
      setBulkDismissIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.add(id));
        return n;
      });
      const settlePatch: Record<string, "applied" | "reverted"> = {};
      for (const [id, state] of Object.entries(patch)) {
        if (state === "applied" || state === "reverted") {
          settlePatch[id] = state;
        }
      }
      if (Object.keys(settlePatch).length > 0) {
        onSettleSnapshots?.(settlePatch);
      }
    },
    [mergeComposerBatchForced, onSettleSnapshots],
  );

  const pendingClarification = useMemo(() => {
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    if (vis.length === 0) return null;

    // Find the index of the last user message to scope the search to the current turn.
    let lastUserVisIdx = -1;
    for (let i = vis.length - 1; i >= 0; i--) {
      if (vis[i]!.m.role === "user") {
        lastUserVisIdx = i;
        break;
      }
    }

    // Search backwards through the current assistant turn (after the last user message)
    // for a clarification fence — either in an assistant message or a tool result message.
    for (let i = vis.length - 1; i > lastUserVisIdx; i--) {
      const { m, originalIdx } = vis[i]!;
      if (m.role !== "assistant" && m.role !== "tool") continue;
      const qs = parseClarificationQuestions(m.content);
      if (!qs?.length) continue;
      // Make sure no user message comes after this message.
      const userAfter = messages
        .slice(originalIdx + 1)
        .some((msg) => !msg.hidden && msg.role === "user");
      if (userAfter) return null;
      return qs;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!pendingClarification) {
      setClarificationOtherOpen(false);
    }
  }, [pendingClarification]);

  const pendingYesNo = useMemo(() => {
    if (pendingClarification) return null;
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    if (vis.length === 0) return null;
    let lastUserVisIdx = -1;
    for (let i = vis.length - 1; i >= 0; i--) {
      if (vis[i]!.m.role === "user") { lastUserVisIdx = i; break; }
    }
    for (let i = vis.length - 1; i > lastUserVisIdx; i--) {
      const { m, originalIdx } = vis[i]!;
      if (m.role !== "assistant" && m.role !== "tool") continue;
      const q = parseYesNoQuestion(m.content);
      if (!q) continue;
      const userAfter = messages.slice(originalIdx + 1).some((msg) => !msg.hidden && msg.role === "user");
      if (userAfter) return null;
      return q;
    }
    return null;
  }, [messages, pendingClarification]);

  const cancelEdit = useCallback(() => setEditingIdx(null), []);

  const commitEdit = useCallback(
    (originalIdx: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onEditMessage(originalIdx, trimmed);
      setEditingIdx(null);
    },
    [onEditMessage],
  );

  return (
    <div ref={paneRef} className="chat-pane">
      <div className="chat-panel-body-main">
        <ChatMessagesPane
          messages={messages}
          readOnly={false}
          scrollRef={messagesScrollRef}
          streaming={streaming}
          error={error}
          toolActivity={toolActivity}
          activeIsThread={isThread}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          bulkDismissIds={bulkDismissIds}
          composerBatchForced={composerBatchForced}
          onFileChanged={onFileChanged}
          onSnapshotSettled={handleSnapshotSettled}
          onForkFromMessage={onForkFromMessage}
          onStartThreadFromMessage={onStartThreadFromMessage}
          onForkToNewConversation={onForkToNewConversation}
          onEditMessage={onEditMessage}
          onDeleteMessages={onDeleteMessages}
          onSetMessageFeedback={onSetMessageFeedback}
          onUseMessageAsThreadSummary={onUseMessageAsThreadSummary}
          commitEdit={commitEdit}
          cancelEdit={cancelEdit}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          fieldLabels={fieldLabels}
          onRetry={onRetry}
          theme={theme}
          parentLastMessage={parentLastMessage}
        />

        <div className="chat-composer-stack">
          {pendingClarification && pendingClarification.length > 0 ? (
            <ChatComposerCard>
              <SuggestedActionsCard
                questions={pendingClarification}
                onSubmit={onSend}
                disabled={streaming}
                onOtherOpen={setClarificationOtherOpen}
              />
            </ChatComposerCard>
          ) : null}
          {pendingYesNo ? (
            <ChatComposerCard>
              <YesNoCard
                question={pendingYesNo}
                onSubmit={(msg) => onSend(msg)}
                disabled={streaming}
              />
            </ChatComposerCard>
          ) : null}
          {pendingWriteFileItems.length > 0 && !streaming ? (
            <WriteFileBatchComposerBar
              items={pendingWriteFileItems}
              onBulkComplete={handleWriteFileBulkComplete}
              onFileChanged={onFileChanged}
              disabled={streaming}
            />
          ) : null}
          <ChatInput
            key={conversationId}
            onSend={onSend}
            onStop={onStop}
            streaming={streaming}
            disabled={clarificationOtherOpen}
            referencedFiles={referencedFiles}
            onAddFile={onAddFile}
            onRemoveFile={onRemoveFile}
            structureRoot={structureRoot}
            useReasoning={useReasoning && reasoningAvailable}
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
            focusTriggerRef={focusTriggerRef}
            onDraftChange={onDraftChange}
          />
        </div>
      </div>

      <ContextBar
        contextInfo={contextInfo}
        activeFile={activeFile}
        isDirty={isDirty}
        systemPromptPreview={systemPromptPreview}
        onFetchContextBlocks={onFetchContextBlocks}
      />

    </div>
  );
}
