import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Scissors,
  GitFork,
  MessageSquare,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import type { ChatMessage, SelectionContext } from "../../types.ts";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import { ToolCallDisplay } from "./ToolCallDisplay.tsx";
import { ChangeCardGroup } from "./ChangeCardGroup.tsx";
import {
  hasClarificationFence,
} from "./clarificationUtils.ts";
import type { CardState } from "./ChangeCard.tsx";
import type { SubRenderUnit } from "./chatRenderUnits.ts";
import { toolResultShownInAssistantTurns } from "./chatRenderUnits.ts";
import type { ChatRenderUnit } from "./chatRenderUnits.ts";
import {
  getTrailingWriteFileBatch,
  isSameWriteFileBatch,
} from "./writeFileBatchUtils.ts";
import "./AssistantTurnCard.css";

const PROMPT_PACK_DISPLAY_NAME = "Prompt-Paket";

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
  copiedIdx: number | null;
  setCopiedIdx: (idx: number | null) => void;
  onFileChanged?: (path: string) => void;
  onSnapshotSettled?: (snapshotId: string) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onDeleteMessages: (indices: number[]) => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
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
  copiedIdx,
  setCopiedIdx,
  onFileChanged,
  onSnapshotSettled,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onDeleteMessages,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
}: AssistantTurnCardProps) {
  const trailingWriteFileBatch = getTrailingWriteFileBatch(visibleEntries);
  const dismissIds = bulkDismissIds;
  const fileCb = readOnly ? undefined : onFileChanged;
  const snapshotCb = readOnly ? undefined : onSnapshotSettled;

  const showActions = !readOnly && !streaming;

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
    return {
      preUnits: pre,
      toolUnits: tools,
      postUnits: post,
      hasToolCalls: hasTc,
    };
  }, [subUnits]);

  const [erkundenOpen, setErkundenOpen] = useState(true);
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
      const { msg, originalIdx, visIdx } = su;
      const visArr = visibleEntries;
      const prevUser = visIdx > 0 ? visArr[visIdx - 1]!.msg : null;
      const showCopyForPromptPack =
        msg.role === "assistant" &&
        msg.content.trim() &&
        prevUser?.role === "user" &&
        prevUser.mode === PROMPT_PACK_DISPLAY_NAME;

      return (
        <div key={key} className="chat-message assistant">
          <div className="chat-message-role">Assistant</div>
          <div className="chat-message-content chat-message-md">
            <ChatMessageMarkdown
              content={msg.content}
              streamingCursor={
                !readOnly &&
                streaming &&
                originalIdx === messages.length - 1
              }
              selectionContext={msg.selectionContext}
              onReplace={
                !readOnly && msg.selectionContext && onReplaceSelection
                  ? (text) =>
                      onReplaceSelection(text, msg.selectionContext!)
                  : undefined
              }
              onApplyFieldUpdate={readOnly ? undefined : onApplyFieldUpdate}
              fieldLabels={fieldLabels}
              suppressClarificationWidget={hasClarificationFence(msg.content)}
            />
          </div>
          {showCopyForPromptPack && (
            <button
              type="button"
              className="copy-msg-btn"
              title="In Zwischenablage kopieren"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(msg.content);
                  setCopiedIdx(originalIdx);
                  setTimeout(() => setCopiedIdx(null), 2000);
                } catch {
                  /* ignore */
                }
              }}
            >
              {copiedIdx === originalIdx ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          )}
        </div>
      );
    }

    if (su.type !== "toolMessage") return null;
    const { msg, originalIdx } = su;
    if (
      msg.role === "tool" &&
      msg.content?.startsWith("glossary_add:success:")
    ) {
      const term = msg.content.slice("glossary_add:success:".length);
      return (
        <div key={key} className="glossary-indicator">
          <span className="glossary-indicator-icon">📖</span>
          <span className="glossary-indicator-text">
            Glossar-Eintrag angelegt: <strong>{term}</strong>
          </span>
        </div>
      );
    }

    if (msg.role === "tool" && msg.toolCallId) {
      if (toolResultShownInAssistantTurns(renderUnits, msg.toolCallId)) {
        return null;
      }
    }

    return (
      <div key={key} className={`chat-message ${msg.role}`}>
        <div className="chat-message-role">Assistant</div>
        <div className="chat-message-content">{msg.content}</div>
      </div>
    );
  };

  return (
    <div className="assistant-turn-wrap">
      {showActions && (
        <div className="assistant-turn-actions" aria-label="Aktionen für diese KI-Antwort">
          {firstVisIdx > 0 && !activeIsThread && (
            <button
              type="button"
              className="chat-fork-btn"
              onClick={() => onStartThreadFromMessage(lastOriginalIdx)}
              title="Thread starten (neuer Chat mit bisherigem Verlauf)"
            >
              <MessageSquare size={12} />
            </button>
          )}
          {firstVisIdx > 0 && (
            <button
              type="button"
              className="chat-fork-btn"
              onClick={() => onForkFromMessage(lastOriginalIdx)}
              title="Hier abschneiden (in-place)"
            >
              <Scissors size={12} />
            </button>
          )}
          {firstVisIdx > 0 && !activeIsThread && (
            <button
              type="button"
              className="chat-fork-btn"
              onClick={() => onForkToNewConversation(lastOriginalIdx)}
              title="Als neuen Chat forken"
            >
              <GitFork size={12} />
            </button>
          )}
          <button
            type="button"
            className="chat-fork-btn chat-fork-btn--danger"
            onClick={() => onDeleteMessages(originalIndices)}
            title="Diese KI-Antwort löschen"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      <div className="assistant-turn-chunks">
        {hasToolCalls ? (
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
                  · {toolUnits.length}{" "}
                  {toolUnits.length === 1 ? "Aufruf" : "Aufrufe"}
                </span>
                {streaming && isLiveTurn ? (
                  <span className="erkunden-spinner" aria-hidden />
                ) : null}
              </button>
              {erkundenOpen ? (
                <div className="erkunden-body">
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
    </div>
  );
}
