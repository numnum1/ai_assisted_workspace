import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Scissors,
  GitFork,
  MessageSquare,
  MessageSquareText,
  Trash2,
  GitMerge,
  Loader,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { TurnCard } from "./TurnCard.tsx";
import type { ChatMessage, MessageFeedback, SelectionContext } from "../../types.ts";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import { ToolCallDisplay } from "./ToolCallDisplay.tsx";
import { ChangeCardGroup } from "./ChangeCardGroup.tsx";
import { hasClarificationFence } from "./clarificationUtils.ts";
import type { CardState } from "./ChangeCard.tsx";
import type { SubRenderUnit } from "./chatRenderUnits.ts";
import { toolResultShownInAssistantTurns } from "./chatRenderUnits.ts";
import type { ChatRenderUnit } from "./chatRenderUnits.ts";
import {
  getTrailingWriteFileBatch,
  isSameWriteFileBatch,
} from "./writeFileBatchUtils.ts";
import "./AssistantTurnCard.css";

function subUnitReactKey(su: SubRenderUnit): string {
  if (su.type === "writeFileGroup") {
    return `wf-${su.items.map((x) => x.originalIdx).join("-")}`;
  }
  if (su.type === "toolCall") {
    return `tool-${su.assistantIdx}-${su.toolCallIdx}`;
  }
  if (su.type === "assistantText") {
    return `at-${su.originalIdx}`;
  }
  return `tm-${su.originalIdx}`;
}

export interface AssistantTurnCardProps {
  originalIndices: number[];
  lastOriginalIdx: number;
  firstVisIdx: number;
  subUnits: SubRenderUnit[];
  messages: ChatMessage[];
  visibleEntries: { msg: ChatMessage; originalIdx: number }[];
  renderUnits: ChatRenderUnit[];
  readOnly: boolean;
  streaming: boolean;
  activeIsThread: boolean;
  bulkDismissIds: Set<string>;
  composerBatchForced: Record<string, CardState>;
  onFileChanged?: (path: string) => void;
  onSnapshotSettled?: (
    snapshotId: string,
    state: "applied" | "reverted" | "dismissed",
  ) => void;

  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onUseMessageAsThreadSummary?: (index: number) => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  naviStep?: string | null;
  naviStateId?: string | null;
}

export function AssistantTurnCard({
  originalIndices,
  lastOriginalIdx,
  firstVisIdx,
  subUnits,
  messages,
  visibleEntries,
  renderUnits,
  readOnly,
  streaming,
  activeIsThread,
  bulkDismissIds,
  composerBatchForced,
  onFileChanged,
  onSnapshotSettled,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onDeleteMessages,
  onSetMessageFeedback,
  onUseMessageAsThreadSummary,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  naviStep,
  naviStateId,
}: AssistantTurnCardProps) {
  const trailingWriteFileBatch = getTrailingWriteFileBatch(visibleEntries);
  const dismissIds = bulkDismissIds;
  const fileCb = readOnly ? undefined : onFileChanged;
  const snapshotCb = readOnly ? undefined : onSnapshotSettled;

  const showNormalActions = !readOnly && !streaming && !naviStateId;
  /** Feedback stays available during Navi-guided turns too — this is exactly what beta testers rate. */
  const showFeedback = !readOnly && !streaming;
  const showActions = showNormalActions || showFeedback;

  const currentFeedback = messages[lastOriginalIdx]?.feedback;
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(currentFeedback?.comment ?? "");

  const handleRating = (rating: "up" | "down") => {
    if (currentFeedback?.rating === rating) {
      onSetMessageFeedback(lastOriginalIdx, null);
      setCommentOpen(false);
      setCommentDraft("");
      return;
    }
    onSetMessageFeedback(lastOriginalIdx, {
      rating,
      comment: commentDraft.trim() || undefined,
      timestamp: Date.now(),
    });
    setCommentOpen(true);
  };

  const handleCommentSave = () => {
    if (!currentFeedback) return;
    const trimmed = commentDraft.trim();
    onSetMessageFeedback(lastOriginalIdx, { ...currentFeedback, comment: trimmed || undefined });
  };

  const { preUnits, toolUnits, postUnits, hasToolCalls } = useMemo(() => {
    const firstToolIdx = subUnits.findIndex((s) => s.type === "toolCall");
    let lastToolIdx = -1;
    for (let i = subUnits.length - 1; i >= 0; i--) {
      if (subUnits[i]!.type === "toolCall") {
        lastToolIdx = i;
        break;
      }
    }
    const hasTc = firstToolIdx >= 0;
    const pre = hasTc ? subUnits.slice(0, firstToolIdx) : subUnits;
    const tools = subUnits.filter((s) => s.type === "toolCall");
    const post = hasTc ? subUnits.slice(lastToolIdx + 1) : [];
    const hasClarificationTool = tools.some(
      (s) => s.type === "toolCall" && s.toolCall.function.name === "ask_clarification",
    );
    return {
      preUnits: hasClarificationTool ? pre.filter((s) => s.type !== "assistantText") : pre,
      toolUnits: tools,
      postUnits: hasClarificationTool ? post.filter((s) => s.type !== "assistantText") : post,
      hasToolCalls: hasTc,
    };
  }, [subUnits]);

  const [erkundenOpen, setErkundenOpen] = useState(false);
  const prevStreamingRef = useRef(streaming);

  const lastVisibleOriginalIdx =
    visibleEntries.length > 0
      ? visibleEntries[visibleEntries.length - 1]!.originalIdx
      : undefined;
  const isLiveTurn =
    lastVisibleOriginalIdx !== undefined &&
    originalIndices.includes(lastVisibleOriginalIdx);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    if (wasStreaming && !streaming && isLiveTurn) {
      setErkundenOpen(false);
    }
    prevStreamingRef.current = streaming;
  }, [streaming, isLiveTurn]);

  const renderSubUnit = (su: SubRenderUnit, key: string) => {
    if (su.type === "writeFileGroup") {
      const isComposerBatch =
        !readOnly &&
        Boolean(
          trailingWriteFileBatch &&
          isSameWriteFileBatch(
            su.items.map((x) => ({ originalIdx: x.originalIdx, data: x.data })),
            trailingWriteFileBatch,
          ),
        );
      const visibleWriteItems = su.items.filter(
        (i) => !dismissIds.has(i.data.snapshotId),
      );
      if (visibleWriteItems.length === 0) return null;
      return (
        <ChangeCardGroup
          key={key}
          items={visibleWriteItems}
          onFileChanged={fileCb}
          externalForced={isComposerBatch ? composerBatchForced : undefined}
          onSnapshotSettled={snapshotCb}
        />
      );
    }

    if (su.type === "toolCall") {
      // create_artifact produces an ```artifact fence as its tool result. Render it as the
      // inline ArtifactCard (via ChatMessageMarkdown) instead of the raw tool-call chrome.
      if (
        su.toolCall.function.name === "create_artifact" &&
        su.resultMsg?.content?.includes("```artifact")
      ) {
        return (
          <div key={key} className="chat-message assistant">
            <div className="chat-message-content chat-message-md">
              <ChatMessageMarkdown content={su.resultMsg.content} />
            </div>
          </div>
        );
      }

      const isStreamingTool = streaming && su.resultMsg === undefined;
      return (
        <ToolCallDisplay
          key={key}
          toolCall={su.toolCall}
          result={su.resultMsg?.content}
          isStreaming={isStreamingTool}
          isLast={su.toolCallIdx === su.toolCallCount - 1}
        />
      );
    }

    if (su.type === "assistantText") {
      const { msg, originalIdx } = su;

      if (msg.kind === "thread-summary") {
        return (
          <div key={key} className="chat-message chat-message--thread-summary">
            <div className="chat-message--thread-summary-header">
              <GitMerge
                size={14}
                aria-hidden
                className="chat-message--thread-summary-icon"
              />
              <span className="chat-message--thread-summary-label">
                Zusammenfassung
                {msg.threadSummaryMeta?.fromThreadTitle
                  ? `: ${msg.threadSummaryMeta.fromThreadTitle}`
                  : ""}
              </span>
            </div>
            <div className="chat-message--thread-summary-body">
              <ChatMessageMarkdown content={msg.content} />
            </div>
          </div>
        );
      }

      return (
        <div key={key} className="chat-message assistant">
          <div className="chat-message-content chat-message-md">
            <ChatMessageMarkdown
              content={msg.content}
              streamingCursor={
                !readOnly && streaming && originalIdx === messages.length - 1
              }
              selectionContext={msg.selectionContext}
              onReplace={
                !readOnly && msg.selectionContext && onReplaceSelection
                  ? (text) => onReplaceSelection(text, msg.selectionContext!)
                  : undefined
              }
              onApplyFieldUpdate={readOnly ? undefined : onApplyFieldUpdate}
              fieldLabels={fieldLabels}
              suppressClarificationWidget={hasClarificationFence(msg.content)}
            />
          </div>
        </div>
      );
    }

    if (su.type !== "toolMessage") return null;
    const { msg } = su;

    if (msg.role === "tool" && msg.toolCallId) {
      if (toolResultShownInAssistantTurns(renderUnits, msg.toolCallId)) {
        return null;
      }
    }

    return (
      <div key={key} className={`chat-message ${msg.role}`}>
        <div className="chat-message-content">{msg.content}</div>
      </div>
    );
  };

  const assistantActions = (
    <>
      {showFeedback && (
        <button
          type="button"
          className={`chat-feedback-btn chat-feedback-btn--up${
            currentFeedback?.rating === "up" ? " chat-feedback-btn--active" : ""
          }`}
          onClick={() => handleRating("up")}
          title="Gute Antwort"
        >
          <ThumbsUp size={12} />
        </button>
      )}
      {showFeedback && (
        <button
          type="button"
          className={`chat-feedback-btn chat-feedback-btn--down${
            currentFeedback?.rating === "down" ? " chat-feedback-btn--active" : ""
          }`}
          onClick={() => handleRating("down")}
          title="Schlechte Antwort"
        >
          <ThumbsDown size={12} />
        </button>
      )}
      {showFeedback && currentFeedback && (
        <button
          type="button"
          className={`chat-feedback-btn${commentOpen ? " chat-feedback-btn--active" : ""}`}
          onClick={() => setCommentOpen((o) => !o)}
          title="Kommentar zur Bewertung"
        >
          <MessageSquareText size={12} />
        </button>
      )}
      {showFeedback && commentOpen && currentFeedback && (
        <div className="chat-feedback-comment-row">
          <textarea
            className="chat-feedback-comment-input"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onBlur={handleCommentSave}
            placeholder="Optionaler Kommentar zu dieser Antwort…"
            rows={2}
          />
        </div>
      )}
      {showNormalActions && firstVisIdx > 0 && (
        <button
          type="button"
          className="chat-fork-btn"
          onClick={() => onStartThreadFromMessage(lastOriginalIdx)}
          title="Thread starten (neuer Chat mit bisherigem Verlauf)"
        >
          <MessageSquare size={12} />
        </button>
      )}
      {showNormalActions && firstVisIdx > 0 && (
        <button
          type="button"
          className="chat-fork-btn"
          onClick={() => onForkFromMessage(lastOriginalIdx)}
          title="Hier abschneiden (in-place)"
        >
          <Scissors size={12} />
        </button>
      )}
      {showNormalActions && firstVisIdx > 0 && (
        <button
          type="button"
          className="chat-fork-btn"
          onClick={() => onForkToNewConversation(lastOriginalIdx)}
          title="Als neuen Chat forken"
        >
          <GitFork size={12} />
        </button>
      )}
      {showNormalActions && activeIsThread && onUseMessageAsThreadSummary && (
        <button
          type="button"
          className="chat-fork-btn chat-fork-btn--merge"
          onClick={() => onUseMessageAsThreadSummary(lastOriginalIdx)}
          title="Verwende diese Nachricht als Zusammenfassung"
        >
          <GitMerge size={12} />
        </button>
      )}
      {showNormalActions && (
        <button
          type="button"
          className="chat-fork-btn chat-fork-btn--danger"
          onClick={() => onDeleteMessages(originalIndices)}
          title="Diese KI-Antwort löschen"
        >
          <Trash2 size={12} />
        </button>
      )}
    </>
  );

  return (
    <TurnCard
      turnType="assistant"
      showActions={showActions}
      actions={assistantActions}
      data-testid="AssistantTurnCard"
    >
      <div className="assistant-turn-chunks">
        {hasToolCalls || (isLiveTurn && !!naviStep) ? (
          <>
            {preUnits.map((su, idx) => {
              const subKey = subUnitReactKey(su);
              return (
                <Fragment key={`${subKey}-pre-${idx}`}>
                  {renderSubUnit(su, subKey)}
                </Fragment>
              );
            })}
            <div className="erkunden-block">
              <button
                type="button"
                className="erkunden-header"
                onClick={() => setErkundenOpen((o) => !o)}
                aria-expanded={erkundenOpen}
              >
                <ChevronRight
                  size={14}
                  className={`erkunden-chevron${erkundenOpen ? " erkunden-chevron--open" : ""}`}
                  aria-hidden
                />
                <span className="erkunden-title">Erkunden</span>
                <span className="erkunden-count">
                  · {toolUnits.length + (isLiveTurn && naviStep ? 1 : 0)}{" "}
                  {toolUnits.length + (isLiveTurn && naviStep ? 1 : 0) === 1 ? "Aufruf" : "Aufrufe"}
                </span>
                {streaming && isLiveTurn && naviStep ? (
                  <>
                    <span className="erkunden-spinner" aria-hidden />
                    <span className="erkunden-step-label">{naviStep}</span>
                  </>
                ) : streaming && isLiveTurn ? (
                  <span className="erkunden-spinner" aria-hidden />
                ) : null}
              </button>
              {erkundenOpen ? (
                <div className="erkunden-body">
                  {isLiveTurn && naviStep ? (
                    <div className="erkunden-navi-step">
                      <Loader size={12} className="erkunden-navi-step-icon" aria-hidden />
                      <span>{naviStep}</span>
                    </div>
                  ) : null}
                  {toolUnits.map((su, idx) => {
                    const subKey = subUnitReactKey(su);
                    return (
                      <Fragment key={`${subKey}-erk-${idx}`}>
                        {renderSubUnit(su, subKey)}
                      </Fragment>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {postUnits.map((su, idx) => {
              const subKey = subUnitReactKey(su);
              return (
                <Fragment key={`${subKey}-post-${idx}`}>
                  {renderSubUnit(su, subKey)}
                </Fragment>
              );
            })}
          </>
        ) : (
          subUnits.map((su, idx) => {
            const subKey = subUnitReactKey(su);
            return (
              <Fragment key={`${subKey}-${idx}`}>
                {renderSubUnit(su, subKey)}
              </Fragment>
            );
          })
        )}
      </div>
    </TurnCard>
  );
}
