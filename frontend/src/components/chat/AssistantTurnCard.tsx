import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  MessageSquareText,
  Trash2,
  GitMerge,
  Loader,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from "lucide-react";
import { TurnCard } from "./TurnCard.tsx";
import type { ChatMessage, MessageFeedback, SelectionContext } from "../../types.ts";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import { ToolCallDisplay } from "./ToolCallDisplay.tsx";
import { hasClarificationFence } from "./clarificationUtils.ts";
import type { SubRenderUnit } from "./chatRenderUnits.ts";
import { toolResultShownInAssistantTurns } from "./chatRenderUnits.ts";
import type { ChatRenderUnit } from "./chatRenderUnits.ts";
import "./AssistantTurnCard.css";

function subUnitReactKey(su: SubRenderUnit): string {
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
  subUnits: SubRenderUnit[];
  messages: ChatMessage[];
  visibleEntries: { msg: ChatMessage; originalIdx: number }[];
  renderUnits: ChatRenderUnit[];
  readOnly: boolean;
  streaming: boolean;

  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onRegenerate?: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  naviStep?: string | null;
  naviStateId?: string | null;
}

export function AssistantTurnCard({
  originalIndices,
  lastOriginalIdx,
  subUnits,
  messages,
  visibleEntries,
  renderUnits,
  readOnly,
  streaming,
  onDeleteMessages,
  onSetMessageFeedback,
  onRegenerate,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  naviStep,
  naviStateId,
}: AssistantTurnCardProps) {
  const showNormalActions = !readOnly && !streaming && !naviStateId;
  /** Feedback stays available during Navi-guided turns too — this is exactly what beta testers rate. */
  const showFeedback = !readOnly && !streaming;
  /** Regenerate (delete + resend the preceding user message) stays available in Navi turns too —
   * it's the main way to retry a reply after tweaking Navi's config mid-conversation. */
  const showRegenerate = !readOnly && !streaming && !!onRegenerate;
  const showActions = showNormalActions || showFeedback || showRegenerate;

  const currentFeedback = messages[lastOriginalIdx]?.feedback;
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(currentFeedback?.comment ?? "");
  /** A rating the user just clicked but hasn't confirmed with a comment yet — not persisted until saved. */
  const [pendingRating, setPendingRating] = useState<"up" | "down" | null>(null);

  const displayedRating = pendingRating ?? currentFeedback?.rating;

  const handleRating = (rating: "up" | "down") => {
    if (currentFeedback?.rating === rating && !pendingRating) {
      onSetMessageFeedback(lastOriginalIdx, null);
      setCommentOpen(false);
      setCommentDraft("");
      setPendingRating(null);
      return;
    }
    if (pendingRating === rating) {
      // Clicking the same not-yet-saved rating again cancels the selection.
      setPendingRating(null);
      setCommentOpen(false);
      setCommentDraft(currentFeedback?.comment ?? "");
      return;
    }
    setPendingRating(rating);
    setCommentDraft(currentFeedback?.comment ?? "");
    setCommentOpen(true);
  };

  const handleCommentSave = () => {
    const rating = pendingRating ?? currentFeedback?.rating;
    const trimmed = commentDraft.trim();
    if (!rating || !trimmed) return;
    onSetMessageFeedback(lastOriginalIdx, { rating, comment: trimmed, timestamp: Date.now() });
    setPendingRating(null);
  };

  const handleCommentCancel = () => {
    setPendingRating(null);
    setCommentOpen(currentFeedback !== undefined);
    setCommentDraft(currentFeedback?.comment ?? "");
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
            displayedRating === "up" ? " chat-feedback-btn--active" : ""
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
            displayedRating === "down" ? " chat-feedback-btn--active" : ""
          }`}
          onClick={() => handleRating("down")}
          title="Schlechte Antwort"
        >
          <ThumbsDown size={12} />
        </button>
      )}
      {showFeedback && currentFeedback && !pendingRating && (
        <button
          type="button"
          className={`chat-feedback-btn${commentOpen ? " chat-feedback-btn--active" : ""}`}
          onClick={() => setCommentOpen((o) => !o)}
          title="Kommentar zur Bewertung"
        >
          <MessageSquareText size={12} />
        </button>
      )}
      {showFeedback && commentOpen && (pendingRating || currentFeedback) && (
        <div className="chat-feedback-comment-row">
          <textarea
            className="chat-feedback-comment-input"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Kommentar zu dieser Antwort (erforderlich)…"
            rows={2}
            autoFocus={!!pendingRating}
          />
          <div className="chat-feedback-comment-actions">
            <button
              type="button"
              className="chat-feedback-comment-save"
              onClick={handleCommentSave}
              disabled={!commentDraft.trim()}
            >
              Speichern
            </button>
            <button type="button" className="chat-feedback-comment-cancel" onClick={handleCommentCancel}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {showRegenerate && (
        <button
          type="button"
          className="chat-fork-btn chat-regenerate-btn"
          onClick={onRegenerate}
          title="Antwort löschen und neu generieren"
        >
          <RotateCcw size={12} />
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
