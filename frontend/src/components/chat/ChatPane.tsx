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
  ChatSessionKind,
  ContextInfo,
} from "../../types.ts";
import { glossaryApi } from "../../api.ts";
import { ChatInput } from "./ChatInput.tsx";
import { ChatComposerCard } from "./ChatComposerCard.tsx";
import { SuggestedActionsCard } from "./SuggestedActionsCard.tsx";
import { parseClarificationQuestions } from "./clarificationUtils.ts";
import {
  parseGuidedThreadOffer,
  type GuidedThreadOfferPayload,
} from "./guidedThreadOfferUtils.ts";
import { GuidedThreadOfferCard } from "./GuidedThreadOfferCard.tsx";
import type { CardState } from "./ChangeCard.tsx";
import { ChatMessagesPane } from "./ChatMessagesPane.tsx";
import { WriteFileBatchComposerBar } from "./WriteFileBatchComposerBar.tsx";
import {
  collectAllWriteFileItems,
  getTrailingWriteFileBatch,
} from "./writeFileBatchUtils.ts";
import {
  parseSteeringPlan,
  type ParsedSteeringPlan,
} from "./planFenceUtils.ts";
import { SteeringPlanViewer } from "./SteeringPlanViewer.tsx";
import { ContextBar, type ContextBlock } from "./ContextBar.tsx";
import "./ChatPane.css";

/** Chars above which auto-scroll stops following during streaming. */
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

export interface ChatPaneProps {
  /** Conversation identity — drives state reset on switch. */
  conversationId: string;
  /** True when this conversation is a thread. Data fact only, not a UI gate. */
  isThread: boolean;

  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;

  onSend: (message: string) => void;
  onStop: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onStartThreadFromMessage: (messageIndex: number) => void;
  onUseMessageAsThreadSummary?: (index: number) => void;
  onRetry?: () => void;

  onAcceptGuidedThreadOffer?: (
    assistantMessageIndex: number,
    payload: GuidedThreadOfferPayload,
  ) => void;

  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;

  onDraftChange?: (text: string) => void;
  focusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  useReasoning?: boolean;
  onToggleReasoning?: () => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;

  activeSessionKind?: ChatSessionKind;
  steeringPlan?: string;
  onMarkSteeringPlanComplete?: () => void;

  onFileChanged?: (path: string) => void;
  /** Persisted settled state for write_file snapshots (from Conversation.writeFileSettled). */
  writeFileSettled?: Record<string, "applied" | "reverted">;
  /** Called when snapshots are settled so the state can be persisted to the conversation. */
  onSettleSnapshots?: (patch: Record<string, "applied" | "reverted">) => void;

  /** Glossary toolkit support (optional). */
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  onOpenPromptPack?: () => void;

  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview?: string | null;
  onFetchContextBlocks?: () => Promise<ContextBlock[]>;

  structureRoot?: string | null;
  theme?: "light" | "dark";
  fieldLabels?: Record<string, string>;
  fullscreen?: boolean;
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
  onForkFromMessage,
  onForkToNewConversation,
  onStartThreadFromMessage,
  onUseMessageAsThreadSummary,
  onRetry,
  onAcceptGuidedThreadOffer,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  onDraftChange,
  focusTriggerRef,
  useReasoning = false,
  onToggleReasoning,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  reasoningAvailable = true,
  fastAvailable = true,
  activeSelection = null,
  onDismissSelection,
  activeSessionKind = "standard",
  steeringPlan = "",
  onMarkSteeringPlanComplete,
  onFileChanged,
  writeFileSettled,
  onSettleSnapshots,
  onReplaceSelection,
  onApplyFieldUpdate,
  onOpenPromptPack,
  contextInfo,
  activeFile,
  isDirty,
  systemPromptPreview,
  onFetchContextBlocks,
  structureRoot = null,
  theme = "dark",
  fieldLabels,
  fullscreen = false,
}: ChatPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<"user" | "assistant" | undefined>(
    undefined,
  );
  const prevStreamingRef = useRef(false);
  const autoScrollActiveRef = useRef(true);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [steeringPlanOpen, setSteeringPlanOpen] = useState(true);
  const [guidedThreadOfferDismissed, setGuidedThreadOfferDismissed] = useState(
    () => new Set<number>(),
  );
  const [composerBatchForced, setComposerBatchForced] = useState<
    Record<string, CardState>
  >({});
  const [toolbarSettledIds, setToolbarSettledIds] = useState(
    () => new Set<string>(),
  );
  const [bulkDismissIds, setBulkDismissIds] = useState(() => new Set<string>());
  const [glossaryPopup, setGlossaryPopup] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const [glossaryForm, setGlossaryForm] = useState<{
    term: string;
    definition: string;
  } | null>(null);
  const [glossarySaving, setGlosarySaving] = useState(false);
  const [clarificationOtherOpen, setClarificationOtherOpen] = useState(false);

  const agentMode = activeSessionKind === "guided";

  // Reset all per-conversation state on conversation switch
  useEffect(() => {
    setComposerBatchForced({});
    setToolbarSettledIds(new Set());
    setBulkDismissIds(new Set());
    setEditingIdx(null);
    setGuidedThreadOfferDismissed(new Set());
    setClarificationOtherOpen(false);
    autoScrollActiveRef.current = true;
    prevLastVisibleRoleRef.current = undefined;
  }, [conversationId]);

  useEffect(() => {
    if (disabledToolkits.has("glossary")) {
      setGlossaryPopup(null);
      setGlossaryForm(null);
    }
  }, [disabledToolkits]);

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

  const parsedSteeringPlan = useMemo(
    (): ParsedSteeringPlan => parseSteeringPlan(steeringPlan ?? null),
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

  const pendingGuidedThreadOffer = useMemo(() => {
    if (!onAcceptGuidedThreadOffer) return null;
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    if (vis.length === 0) return null;

    // Find the last user message to scope search to the current assistant turn.
    let lastUserVisIdx = -1;
    for (let i = vis.length - 1; i >= 0; i--) {
      if (vis[i]!.m.role === "user") {
        lastUserVisIdx = i;
        break;
      }
    }

    // Search backwards through assistant + tool messages in the current turn.
    // The offer fence lands in a tool-result message (role="tool"), so we must
    // not restrict to role="assistant" only.
    for (let i = vis.length - 1; i > lastUserVisIdx; i--) {
      const { m, originalIdx } = vis[i]!;
      if (m.role !== "assistant" && m.role !== "tool") continue;
      const offer = parseGuidedThreadOffer(m.content);
      if (!offer) continue;
      // Ensure no user message follows this one.
      const userAfter = messages
        .slice(originalIdx + 1)
        .some((msg) => !msg.hidden && msg.role === "user");
      if (userAfter) return null;
      // For tool messages, key the dismiss-set against the owning assistant message.
      let assistantIdx = originalIdx;
      if (m.role === "tool") {
        for (let j = i - 1; j >= 0; j--) {
          if (vis[j]!.m.role === "assistant") {
            assistantIdx = vis[j]!.originalIdx;
            break;
          }
        }
      }
      if (guidedThreadOfferDismissed.has(assistantIdx)) return null;
      return { offer, assistantIdx };
    }
    return null;
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

  const handleMessagesMouseUp = useCallback(() => {
    if (disabledToolkits.has("glossary")) {
      setGlossaryPopup(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setGlossaryPopup(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      setGlossaryPopup(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const paneRect = paneRef.current?.getBoundingClientRect();
    if (!paneRect) return;
    setGlossaryPopup({
      x: rect.left - paneRect.left + rect.width / 2,
      y: rect.top - paneRect.top - 8,
      selectedText: text,
    });
  }, [disabledToolkits]);

  const handleSaveToGlossary = async () => {
    if (!glossaryForm) return;
    setGlosarySaving(true);
    try {
      await glossaryApi.addEntry(glossaryForm.term, glossaryForm.definition);
    } finally {
      setGlosarySaving(false);
      setGlossaryForm(null);
      setGlossaryPopup(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div ref={paneRef} className="chat-pane">
      <div className="chat-panel-body-main">
        <ChatMessagesPane
          messages={messages}
          readOnly={false}
          scrollRef={messagesScrollRef}
          onMouseUp={handleMessagesMouseUp}
          streaming={streaming}
          error={error}
          toolActivity={toolActivity}
          activeIsThread={isThread}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          copiedIdx={copiedIdx}
          setCopiedIdx={setCopiedIdx}
          bulkDismissIds={bulkDismissIds}
          composerBatchForced={composerBatchForced}
          onFileChanged={onFileChanged}
          onSnapshotSettled={handleSnapshotSettled}
          onForkFromMessage={onForkFromMessage}
          onStartThreadFromMessage={onStartThreadFromMessage}
          onForkToNewConversation={onForkToNewConversation}
          onEditMessage={onEditMessage}
          onDeleteMessages={onDeleteMessages}
          onUseMessageAsThreadSummary={onUseMessageAsThreadSummary}
          commitEdit={commitEdit}
          cancelEdit={cancelEdit}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          fieldLabels={fieldLabels}
          onRetry={onRetry}
          onOpenPromptPack={onOpenPromptPack}
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
                onOtherOpen={setClarificationOtherOpen}
              />
            </ChatComposerCard>
          ) : null}
          {pendingGuidedThreadOffer && !pendingClarification ? (
            <ChatComposerCard>
              <GuidedThreadOfferCard
                offer={pendingGuidedThreadOffer.offer}
                blocked={false}
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
            key={conversationId}
            onSend={onSend}
            onStop={onStop}
            streaming={streaming}
            disabled={clarificationOtherOpen}
            referencedFiles={referencedFiles}
            onAddFile={onAddFile}
            onRemoveFile={onRemoveFile}
            fullscreen={fullscreen}
            structureRoot={structureRoot}
            useReasoning={useReasoning && reasoningAvailable}
            onToggleReasoning={agentMode ? undefined : onToggleReasoning}
            disabledToolkits={disabledToolkits}
            onToggleToolkit={agentMode ? undefined : onToggleToolkit}
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

      {glossaryPopup && !glossaryForm && !disabledToolkits.has("glossary") && (
        <div
          className="glossary-selection-popup"
          style={{ left: glossaryPopup.x, top: glossaryPopup.y }}
        >
          <button
            className="glossary-selection-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              setGlossaryForm({
                term: glossaryPopup.selectedText,
                definition: "",
              });
            }}
          >
            📖 Als Glossar-Begriff speichern
          </button>
        </div>
      )}

      {glossaryForm && !disabledToolkits.has("glossary") && (
        <div
          className="glossary-save-overlay"
          onClick={() => {
            setGlossaryForm(null);
            setGlossaryPopup(null);
          }}
        >
          <div
            className="glossary-save-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glossary-save-title">Glossar-Eintrag speichern</div>
            <label className="glossary-save-label">
              Begriff
              <input
                className="glossary-save-input"
                value={glossaryForm.term}
                onChange={(e) =>
                  setGlossaryForm({ ...glossaryForm, term: e.target.value })
                }
                autoFocus
              />
            </label>
            <label className="glossary-save-label">
              Definition
              <textarea
                className="glossary-save-textarea"
                value={glossaryForm.definition}
                onChange={(e) =>
                  setGlossaryForm({
                    ...glossaryForm,
                    definition: e.target.value,
                  })
                }
                rows={3}
                placeholder="Kurze Erklärung..."
              />
            </label>
            <div className="glossary-save-actions">
              <button
                className="glossary-save-cancel"
                onClick={() => {
                  setGlossaryForm(null);
                  setGlossaryPopup(null);
                }}
              >
                Abbrechen
              </button>
              <button
                className="glossary-save-confirm"
                disabled={
                  !glossaryForm.term.trim() ||
                  !glossaryForm.definition.trim() ||
                  glossarySaving
                }
                onClick={handleSaveToGlossary}
              >
                {glossarySaving ? "Speichere…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
