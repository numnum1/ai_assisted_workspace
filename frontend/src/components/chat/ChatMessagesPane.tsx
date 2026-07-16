import React, { useState, useMemo, memo } from "react";
import type { RefObject } from "react";
import {
  Search,
  Check,
  Pencil,
  X,
  Trash2,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, MessageFeedback, SelectionContext } from "../../types.ts";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import { AssistantTurnCard } from "./AssistantTurnCard.tsx";
import { TurnCard } from "./TurnCard.tsx";
import { buildChatRenderUnits } from "./chatRenderUnits.ts";
import {
  effectiveModeColor,
  getContrastingTextColor,
} from "./modeColorTheme.ts";
import { hasClarificationFence } from "./clarificationUtils.ts";
import { FileChip } from "../common/FileChip.tsx";

const CHOICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function ClarificationAnswerCard({
  data,
  modeColor,
  contrastColor,
}: {
  data: NonNullable<ChatMessage["clarificationData"]>;
  modeColor?: string;
  contrastColor?: string;
}) {
  const colorOverrides =
    modeColor && contrastColor
      ? ({
          "--sac-letter-bg": `color-mix(in srgb, ${contrastColor} 18%, transparent)`,
          "--sac-letter-border": `color-mix(in srgb, ${contrastColor} 40%, transparent)`,
          "--sac-letter-color": contrastColor,
          "--sac-selected-letter-bg": contrastColor,
          "--sac-selected-letter-border": contrastColor,
          "--sac-selected-letter-color": modeColor,
          "--sac-selected-text": contrastColor,
          "--sac-question-color": `color-mix(in srgb, ${contrastColor} 65%, transparent)`,
        } as React.CSSProperties)
      : undefined;

  return (
    <div className="sac-surface clarification-answer-card" style={colorOverrides}>
      <div className="sac-body">
        {data.questions.map((q, qIdx) => {
          const sel = data.selected[qIdx] ?? [];
          const customAnswers = sel.filter((s) => !q.options.includes(s));
          return (
            <div key={qIdx} className="sac-block">
              <p className="sac-question">{q.question}</p>
              <div className="sac-options">
                {q.options.map((opt, i) => {
                  const letter =
                    i < CHOICE_LETTERS.length
                      ? CHOICE_LETTERS[i]
                      : String(i + 1);
                  const isSelected = sel.includes(opt);
                  return (
                    <div key={i} className="sac-option-wrap">
                      <button
                        type="button"
                        className={`sac-option${isSelected ? " selected" : ""}`}
                        disabled
                      >
                        <span className="sac-letter" aria-hidden>
                          {letter}
                        </span>
                        <span className="sac-option-text">{opt}</span>
                      </button>
                    </div>
                  );
                })}
                {customAnswers.map((custom, i) => (
                  <div key={`custom-${i}`} className="sac-option-wrap">
                    <button type="button" className="sac-option selected" disabled>
                      <span className="sac-option-text">{custom}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MessageEditBoxProps {
  initialContent: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export const MessageEditBox = memo(function MessageEditBox({
  initialContent,
  onSave,
  onCancel,
}: MessageEditBoxProps) {
  const [draft, setDraft] = useState(initialContent);

  return (
    <div className="chat-message-edit-wrap">
      {/* Grid-based autosize (data-replicated-value) — avoids reading scrollHeight on
          every keystroke, which forces a synchronous layout that gets more expensive
          the longer the surrounding chat DOM is. */}
      <div className="chat-message-edit-autosize" data-replicated-value={draft}>
        <textarea
          className="chat-message-edit-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSave(draft);
            }
          }}
          autoFocus
        />
      </div>
      <div className="chat-edit-actions">
        <button
          type="button"
          className="chat-edit-save-btn"
          disabled={!draft.trim()}
          onClick={() => onSave(draft)}
          title="Speichern (Enter)"
        >
          <Check size={14} />
          <span>Speichern</span>
        </button>
        <button
          type="button"
          className="chat-edit-cancel-btn"
          onClick={onCancel}
          title="Abbrechen (Esc)"
        >
          <X size={14} />
          <span>Abbrechen</span>
        </button>
      </div>
    </div>
  );
});

export interface ChatMessagesPaneProps {
  messages: ChatMessage[];
  readOnly: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMouseUp?: () => void;
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  naviStep?: string | null;
  naviStateId?: string | null;
  editingIdx: number | null;
  setEditingIdx: (idx: number | null) => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  commitEdit: (index: number, text: string) => void;
  cancelEdit: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  onRetry?: () => void;
  onOpenPromptPack?: () => void;
  theme: "light" | "dark";
}

export function ChatMessagesPane({
  messages,
  readOnly,
  scrollRef,
  onMouseUp,
  streaming,
  error,
  toolActivity,
  naviStep,
  naviStateId,
  editingIdx,
  setEditingIdx,
  onEditMessage,
  onDeleteMessages,
  onSetMessageFeedback,
  commitEdit,
  cancelEdit,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  onRetry,
  theme,
}: ChatMessagesPaneProps) {
  const visibleEntries = useMemo(
    () =>
      messages
        .map((msg, originalIdx) => ({ msg, originalIdx }))
        .filter(({ msg }) => !msg.hidden),
    [messages],
  );
  const renderUnits = useMemo(
    () => buildChatRenderUnits(visibleEntries),
    [visibleEntries],
  );

  return (
    <div
      className={`chat-messages${readOnly ? " chat-messages--readonly" : ""}`}
      data-testid="ChatMessagesPane"
      ref={scrollRef}
      onMouseUp={readOnly ? undefined : onMouseUp}
    >
      {messages.filter((m) => !m.hidden).length === 0 && (
        <div className="chat-empty">
          <p>Start a conversation with your AI assistant.</p>
          <p className="chat-empty-hint">
            Drag files from the project tree into the input area to reference
            them, or use @filename syntax in the input area.
          </p>
        </div>
      )}
      {renderUnits.map((unit, unitIdx) => {
        if (unit.type === "assistantTurn") {
          const isLastAssistantTurn = !renderUnits
            .slice(unitIdx + 1)
            .some((u) => u.type === "assistantTurn");
          return (
            <AssistantTurnCard
              key={`turn-${unit.originalIndices.join("-")}`}
              originalIndices={unit.originalIndices}
              lastOriginalIdx={unit.lastOriginalIdx}
              subUnits={unit.subUnits}
              messages={messages}
              visibleEntries={visibleEntries}
              renderUnits={renderUnits}
              readOnly={readOnly}
              streaming={streaming}
              onDeleteMessages={onDeleteMessages}
              onSetMessageFeedback={onSetMessageFeedback}
              onReplaceSelection={onReplaceSelection}
              onApplyFieldUpdate={onApplyFieldUpdate}
              fieldLabels={fieldLabels}
              naviStep={isLastAssistantTurn ? naviStep : null}
              naviStateId={naviStateId}
            />
          );
        }

        if (unit.type === "userTurn") {
          const { messages: turnMsgs, originalIndices, lastOriginalIdx, firstVisIdx } = unit;
          const visArr = visibleEntries;
          const isLastTurn = !visArr
            .slice(firstVisIdx + turnMsgs.length)
            .some(({ msg: m }) => m.role === "user");
          // First message drives the visual style (mode color, role label).
          const firstMsg = turnMsgs[0]!.msg;
          const displayModeColor = firstMsg.modeColor
            ? (effectiveModeColor(firstMsg.modeColor, theme) ?? firstMsg.modeColor)
            : undefined;

          const userActions = (
            <>
              {isLastTurn && (
                <button
                  type="button"
                  className="chat-fork-btn chat-resend-btn"
                  onClick={() => onEditMessage(lastOriginalIdx, turnMsgs[turnMsgs.length - 1]!.msg.content)}
                  title="Nachricht erneut senden"
                >
                  <RotateCcw size={12} />
                </button>
              )}
              {turnMsgs.length === 1 && (
                <button
                  type="button"
                  className="chat-fork-btn chat-edit-btn"
                  onClick={() => setEditingIdx(turnMsgs[0]!.originalIdx)}
                  title="Nachricht bearbeiten"
                >
                  <Pencil size={12} />
                </button>
              )}
              <button
                type="button"
                className="chat-fork-btn chat-fork-btn--danger"
                onClick={() => onDeleteMessages(originalIndices)}
                title="Turn löschen"
              >
                <Trash2 size={12} />
              </button>
            </>
          );

          return (
            <TurnCard
              key={`uturn-${lastOriginalIdx}`}
              turnType="user"
              showActions={!readOnly && !streaming && !naviStateId && !turnMsgs.some((m) => editingIdx === m.originalIdx)}
              actions={userActions}
            >
              {turnMsgs.map(({ msg, originalIdx: msgIdx }) => (
                <div
                  key={msgIdx}
                  className="chat-message user"
                  style={
                    displayModeColor
                      ? {
                          backgroundColor: displayModeColor,
                          borderLeftColor: displayModeColor,
                          color: getContrastingTextColor(displayModeColor),
                        }
                      : undefined
                  }
                >
                  <div
                    className="chat-message-role"
                    style={
                      displayModeColor
                        ? { color: getContrastingTextColor(displayModeColor) }
                        : undefined
                    }
                  >
                    <span>
                      You
                      {msg.mode && (
                        <span
                          className="chat-message-mode"
                          style={{ color: getContrastingTextColor(displayModeColor) }}
                        >
                          {" · "}
                          {msg.mode}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="chat-message-content">
                    {readOnly || editingIdx !== msgIdx ? (
                      msg.clarificationData ? (
                        <ClarificationAnswerCard
                          data={msg.clarificationData}
                          modeColor={displayModeColor}
                          contrastColor={getContrastingTextColor(displayModeColor)}
                        />
                      ) : (
                        msg.content
                      )
                    ) : (
                      <MessageEditBox
                        initialContent={msg.content}
                        onSave={(text) => commitEdit(msgIdx, text)}
                        onCancel={cancelEdit}
                      />
                    )}
                  </div>
                  {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className="chat-message-attached-files">
                      {msg.attachedFiles.map((f) => (
                        <FileChip key={f} path={f} readonly />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </TurnCard>
          );
        }

        // Fallback for system messages and legacy message units.
        const { msg, originalIdx } = unit;

        return (
          <div key={originalIdx}>
            <div
              className={`chat-message ${msg.role}`}
            >
              {msg.role === "system" && (
                <div className="chat-message-role">
                  <span>Kontext</span>
                </div>
              )}
              <div
                className={
                  msg.role === "assistant"
                    ? "chat-message-content chat-message-md"
                    : msg.role === "system"
                      ? "chat-message-content chat-message-system-md chat-message-md"
                      : "chat-message-content"
                }
              >
                {msg.role === "assistant" ? (
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
                    onApplyFieldUpdate={
                      readOnly ? undefined : onApplyFieldUpdate
                    }
                    fieldLabels={fieldLabels}
                    suppressClarificationWidget={hasClarificationFence(
                      msg.content,
                    )}
                  />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
              {!readOnly && !streaming && editingIdx !== originalIdx && (
                <div className="chat-fork-actions">
                  <button
                    type="button"
                    className="chat-fork-btn chat-fork-btn--danger"
                    onClick={() => onDeleteMessages([originalIdx])}
                    title="Nachricht löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!readOnly && toolActivity && streaming && (
        <div className="chat-tool-activity">
          <Search size={14} className="chat-tool-activity-icon" />
          <span>{toolActivity}</span>
        </div>
      )}
      {!readOnly && error && (
        <div className="chat-message error">
          <div className="chat-message-content">
            {error === "NETWORK_ERROR" ? (
              <>
                <strong>Verbindungsproblem:</strong> Die KI-API ist nicht
                erreichbar.
                <br />
                Bitte VPN-Verbindung prüfen — aktive VPN-Verbindungen können die
                DNS-Auflösung blockieren.
              </>
            ) : error === "MODEL_EMPTY_RESPONSE" ? (
              "Das Modell hat keine Antwort geliefert (Kontext zu lang oder Inhaltsfilter)."
            ) : (
              `Error: ${error}`
            )}
          </div>
          {(error === "MODEL_EMPTY_RESPONSE" || error === "NETWORK_ERROR") &&
            onRetry && (
              <button
                type="button"
                className="chat-retry-btn"
                onClick={onRetry}
              >
                Erneut versuchen
              </button>
            )}
        </div>
      )}
    </div>
  );
}
