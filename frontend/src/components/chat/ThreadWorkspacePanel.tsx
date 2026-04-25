import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Minimize2 } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import type {
  ChatMessage,
  ChatSessionKind,
  SelectionContext,
} from "../../types.ts";
import {
  parseClarificationQuestions,
} from "./clarificationUtils.ts";
import {
  parseGuidedThreadOffer,
  type GuidedThreadOfferPayload,
} from "./guidedThreadOfferUtils.ts";
import { GuidedThreadOfferCard } from "./GuidedThreadOfferCard.tsx";
import {
  ThreadBranchPicker,
  type ThreadBranchItem,
} from "./ThreadBranchPicker.tsx";
import type { CardState } from "./ChangeCard.tsx";
import { ChatMessagesPane } from "./ChatMessagesPane.tsx";
import { ChatInteractivePane } from "./ChatInteractivePane.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { ChatComposerCard } from "./ChatComposerCard.tsx";
import { SuggestedActionsCard } from "./SuggestedActionsCard.tsx";
import { WriteFileBatchComposerBar } from "./WriteFileBatchComposerBar.tsx";
import {
  collectAllWriteFileItems,
  getTrailingWriteFileBatch,
} from "./writeFileBatchUtils.ts";
import {
  parseSteeringPlan,
  type ParsedSteeringPlan,
} from "./planFenceUtils.ts";
import { settleWriteFileMessage } from "./writeFileToolParse.ts";
import { SteeringPlanViewer } from "./SteeringPlanViewer.tsx";
import {
  loadChatThreadSplitLayout,
  saveChatThreadSplitLayout,
} from "./chatThreadSplitPanelLayout.ts";
import "./ChatThreadSplitResizable.css";

/** Chars above which auto-scroll stops following. */
const AUTOSCROLL_CHAR_LIMIT = 1500;

function SteeringPlanSection({
  open,
  onToggleOpen,
  steeringPlan,
  parsedSteeringPlan,
  streaming,
  onMarkSteeringPlanComplete,
}: {
  open: boolean;
  onToggleOpen: () => void;
  steeringPlan: string;
  parsedSteeringPlan: ParsedSteeringPlan;
  streaming: boolean;
  onMarkSteeringPlanComplete?: () => void;
}) {
  const hasPlan = Boolean(steeringPlan?.trim());
  const markDisabled =
    streaming ||
    !hasPlan ||
    parsedSteeringPlan.isComplete ||
    !onMarkSteeringPlanComplete;

  let markTitle: string | undefined;
  if (parsedSteeringPlan.isComplete) {
    markTitle = "Plan ist bereits als abgeschlossen markiert";
  } else if (streaming) {
    markTitle = "Während einer Antwort nicht möglich";
  } else if (!hasPlan) {
    markTitle = "Zuerst einen Plan durch die Assistentin anlegen lassen";
  }

  return (
    <div className="chat-steering-plan-panel">
      <button
        type="button"
        className="chat-steering-plan-toggle"
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        Arbeitsplan
        <span className="chat-steering-plan-chevron">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="chat-steering-plan-body">
          {hasPlan ? (
            <>
              <SteeringPlanViewer parsedPlan={parsedSteeringPlan} />
              <div className="chat-steering-plan-actions">
                <button
                  type="button"
                  className="chat-steering-plan-mark-complete-btn"
                  disabled={markDisabled}
                  title={markTitle}
                  onClick={() => onMarkSteeringPlanComplete?.()}
                >
                  Plan als abgeschlossen markieren
                </button>
              </div>
            </>
          ) : (
            <p className="chat-steering-plan-empty">
              Noch kein Plan — die Assistentin legt ihn in der ersten
              inhaltlichen Antwort als Markdown-Block mit Sprache{" "}
              <code>plan</code> an.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ThreadWorkspacePanelProps {
  /** Thread conversation */
  threadConversationId: string;
  threadTitle: string;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;

  /** Parent conversation */
  parentConversation: { id: string; title: string } | null;
  parentMessages: ChatMessage[];
  parentStreaming: boolean;

  /** Thread navigation */
  mainBranchItem: ThreadBranchItem;
  threadBranchItems: ThreadBranchItem[];
  onSwitchBranch: (id: string) => void;

  /** Close the workspace overlay */
  onClose: () => void;

  /** Thread message actions */
  onSend: (message: string) => void;
  onStop: () => void;
  onSendToParent: (message: string) => void;
  onStopParent: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onRetry?: () => void;

  /** Guided thread offer */
  onAcceptGuidedThreadOffer?: (
    assistantMessageIndex: number,
    payload: GuidedThreadOfferPayload,
  ) => void;

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
  mainBranchItem,
  threadBranchItems,
  onSwitchBranch,
  onClose,
  onSend,
  onStop,
  onSendToParent,
  onStopParent,
  onEditMessage,
  onDeleteMessages,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onRetry,
  onAcceptGuidedThreadOffer,
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
}: ThreadWorkspacePanelProps) {
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<"user" | "assistant" | undefined>(undefined);
  const prevStreamingRef = useRef(false);
  const autoScrollActiveRef = useRef(true);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [steeringPlanOpen, setSteeringPlanOpen] = useState(true);
  const [guidedThreadOfferDismissed, setGuidedThreadOfferDismissed] = useState(
    () => new Set<number>(),
  );

  const [composerBatchForced, setComposerBatchForced] = useState<Record<string, CardState>>({});
  const [toolbarSettledIds, setToolbarSettledIds] = useState(() => new Set<string>());
  const [bulkDismissIds, setBulkDismissIds] = useState(() => new Set<string>());

  // Reset state on conversation switch
  useEffect(() => {
    setComposerBatchForced({});
    setToolbarSettledIds(new Set());
    setBulkDismissIds(new Set());
    setEditingIdx(null);
    setGuidedThreadOfferDismissed(new Set());
    autoScrollActiveRef.current = true;
    prevLastVisibleRoleRef.current = undefined;
  }, [threadConversationId]);

  const parsedSteeringPlan = useMemo(
    () => parseSteeringPlan(steeringPlan ?? null),
    [steeringPlan],
  );

  const visibleEntries = useMemo(
    () =>
      messages
        .map((msg, originalIdx) => ({ msg, originalIdx }))
        .filter(({ msg }) => !msg.hidden),
    [messages],
  );

  const trailingWriteFileBatch = useMemo(
    () => getTrailingWriteFileBatch(visibleEntries),
    [visibleEntries],
  );
  const composerBatchKey =
    trailingWriteFileBatch?.map((i) => i.data.snapshotId).join("\0") ?? "";

  useEffect(() => {
    setComposerBatchForced({});
  }, [composerBatchKey]);

  const allWriteFileItems = useMemo(
    () => collectAllWriteFileItems(visibleEntries),
    [visibleEntries],
  );
  const pendingWriteFileItems = useMemo(
    () => allWriteFileItems.filter((i) => !toolbarSettledIds.has(i.data.snapshotId)),
    [allWriteFileItems, toolbarSettledIds],
  );

  const mergeComposerBatchForced = useCallback((patch: Record<string, CardState>) => {
    setComposerBatchForced((p) => ({ ...p, ...patch }));
  }, []);

  const handleSnapshotSettled = useCallback((snapshotId: string) => {
    setToolbarSettledIds((prev) => new Set(prev).add(snapshotId));
  }, []);

  const handleMessageSettle = useCallback(
    (originalIdx: number, state: "applied" | "reverted") => {
      const msg = messages[originalIdx];
      if (!msg) return;
      const newContent = settleWriteFileMessage(msg.content, state);
      if (newContent !== msg.content) {
        onUpdateMessage?.(originalIdx, newContent);
      }
    },
    [messages, onUpdateMessage],
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
      for (const item of pendingWriteFileItems) {
        const state = patch[item.data.snapshotId] as CardState | undefined;
        if (state === "applied" || state === "reverted") {
          const msg = messages[item.originalIdx];
          if (msg) {
            const newContent = settleWriteFileMessage(msg.content, state);
            if (newContent !== msg.content) {
              onUpdateMessage?.(item.originalIdx, newContent);
            }
          }
        }
      }
    },
    [mergeComposerBatchForced, pendingWriteFileItems, messages, onUpdateMessage],
  );

  const pendingClarification = useMemo(() => {
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    const last = vis[vis.length - 1];
    if (!last || last.m.role !== "assistant") return null;
    const qs = parseClarificationQuestions(last.m.content);
    if (!qs?.length) return null;
    const userAfter = messages
      .slice(last.originalIdx + 1)
      .some((m) => !m.hidden && m.role === "user");
    if (userAfter) return null;
    return qs;
  }, [messages]);

  const pendingGuidedThreadOffer = useMemo(() => {
    if (!onAcceptGuidedThreadOffer) return null;
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    const last = vis[vis.length - 1];
    if (!last || last.m.role !== "assistant") return null;
    const offer = parseGuidedThreadOffer(last.m.content);
    if (!offer) return null;
    const userAfter = messages
      .slice(last.originalIdx + 1)
      .some((m) => !m.hidden && m.role === "user");
    if (userAfter) return null;
    if (guidedThreadOfferDismissed.has(last.originalIdx)) return null;
    return { offer, assistantIdx: last.originalIdx };
  }, [messages, onAcceptGuidedThreadOffer, guidedThreadOfferDismissed]);

  const handleDismissGuidedThreadOffer = useCallback(() => {
    if (!pendingGuidedThreadOffer) return;
    setGuidedThreadOfferDismissed((prev) =>
      new Set(prev).add(pendingGuidedThreadOffer.assistantIdx),
    );
  }, [pendingGuidedThreadOffer]);

  const handleAcceptGuidedThreadOfferClick = useCallback(() => {
    if (!pendingGuidedThreadOffer || !onAcceptGuidedThreadOffer) return;
    onAcceptGuidedThreadOffer(
      pendingGuidedThreadOffer.assistantIdx,
      pendingGuidedThreadOffer.offer,
    );
  }, [pendingGuidedThreadOffer, onAcceptGuidedThreadOffer]);

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

  // Scroll to bottom on conversation switch or new messages
  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, [threadConversationId, messages.length]);

  useEffect(() => {
    prevLastVisibleRoleRef.current = undefined;
    autoScrollActiveRef.current = true;
  }, [threadConversationId]);

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

  // Disable follow-scroll when user scrolls away from bottom
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || !streaming) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 60) {
        autoScrollActiveRef.current = false;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [streaming]);

  // Lock body scroll and handle Escape
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

  const agentMode = activeSessionKind === "guided";

  return (
    <div className="chat-panel chat-panel--expanded chat-panel--thread-split">
      <div className="chat-header">
        <span className="chat-header-title" title={threadTitle}>
          {threadTitle}
        </span>
        <div className="chat-header-actions">
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
              <ChatInteractivePane
                key={parentConversation?.id ?? "parent"}
                conversationId={parentConversation?.id ?? ""}
                messages={parentMessages}
                streaming={parentStreaming}
                error={null}
                toolActivity={null}
                onSend={onSendToParent}
                onStop={onStopParent}
                onEditMessage={onEditMessage}
                onDeleteMessages={onDeleteMessages}
                onForkFromMessage={onForkFromMessage}
                onStartThreadFromMessage={onStartThreadFromMessage}
                onForkToNewConversation={onForkToNewConversation}
                referencedFiles={referencedFiles}
                onAddFile={onAddFile}
                onRemoveFile={onRemoveFile}
                fullscreen={true}
                structureRoot={structureRoot}
                theme={theme}
                fieldLabels={fieldLabels}
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
              <div className="chat-panel-body-main">
                <ChatMessagesPane
                  messages={messages}
                  readOnly={false}
                  scrollRef={messagesScrollRef}
                  streaming={streaming}
                  error={error}
                  toolActivity={toolActivity}
                  activeIsThread={true}
                  editingIdx={editingIdx}
                  setEditingIdx={setEditingIdx}
                  copiedIdx={copiedIdx}
                  setCopiedIdx={setCopiedIdx}
                  bulkDismissIds={bulkDismissIds}
                  composerBatchForced={composerBatchForced}
                  onFileChanged={onFileChanged}
                  onSnapshotSettled={handleSnapshotSettled}
                  onMessageSettle={handleMessageSettle}
                  onForkFromMessage={onForkFromMessage}
                  onStartThreadFromMessage={onStartThreadFromMessage}
                  onForkToNewConversation={onForkToNewConversation}
                  onEditMessage={onEditMessage}
                  onDeleteMessages={onDeleteMessages}
                  commitEdit={commitEdit}
                  cancelEdit={cancelEdit}
                  fieldLabels={fieldLabels}
                  onRetry={onRetry}
                  theme={theme}
                />

                {activeSessionKind === "guided" && (
                  <SteeringPlanSection
                    open={steeringPlanOpen}
                    onToggleOpen={() => setSteeringPlanOpen((o) => !o)}
                    steeringPlan={steeringPlan}
                    parsedSteeringPlan={parsedSteeringPlan}
                    streaming={streaming}
                    onMarkSteeringPlanComplete={onMarkSteeringPlanComplete}
                  />
                )}

                <div className="chat-composer-stack">
                  {pendingClarification && pendingClarification.length > 0 ? (
                    <ChatComposerCard>
                      <SuggestedActionsCard
                        questions={pendingClarification}
                        onSubmit={onSend}
                        disabled={streaming}
                      />
                    </ChatComposerCard>
                  ) : null}
                  {pendingGuidedThreadOffer && !pendingClarification ? (
                    <ChatComposerCard>
                      <GuidedThreadOfferCard
                        offer={pendingGuidedThreadOffer.offer}
                        blocked={true}
                        disabled={streaming}
                        onAccept={handleAcceptGuidedThreadOfferClick}
                        onDismiss={handleDismissGuidedThreadOffer}
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
                    key={threadConversationId}
                    onSend={onSend}
                    onStop={onStop}
                    streaming={streaming}
                    referencedFiles={referencedFiles}
                    onAddFile={onAddFile}
                    onRemoveFile={onRemoveFile}
                    fullscreen={true}
                    structureRoot={structureRoot}
                    useReasoning={useReasoning && reasoningAvailable}
                    onToggleReasoning={agentMode ? undefined : onToggleReasoning}
                    disabledToolkits={disabledToolkits}
                    onToggleToolkit={agentMode ? undefined : onToggleToolkit}
                    reasoningAvailable={reasoningAvailable}
                    fastAvailable={fastAvailable}
                    activeSelection={activeSelection}
                    onDismissSelection={onDismissSelection}
                  />
                </div>
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
