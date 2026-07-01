import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, X } from "lucide-react";
import type { AgentPreset, ChatSessionKind } from "../../types.ts";

export interface NewChatConfirmPayload {
  title: string;
  sessionKind: ChatSessionKind;
  /** Optional markdown; for guided sessions, stored as initial steering plan. */
  initialSteeringPlan?: string;
  /** When set with guided session, {@link App} applies the matching project agent preset. */
  agentPresetId?: string;
}

interface NewChatDialogProps {
  currentTitle: string;
  agentPresets?: AgentPreset[];
  onConfirm: (payload: NewChatConfirmPayload) => void;
  onDiscard: (payload: NewChatConfirmPayload) => void;
  onCancel: () => void;
}

export function NewChatDialog({
  currentTitle,
  agentPresets = [],
  onConfirm,
  onDiscard,
  onCancel,
}: NewChatDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(currentTitle);
  const [sessionKind, setSessionKind] = useState<ChatSessionKind>("standard");
  const [agentPresetId, setAgentPresetId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const buildPayload = (): NewChatConfirmPayload => ({
    title: title.trim() || currentTitle,
    sessionKind,
    ...(sessionKind === "guided" && agentPresetId ? { agentPresetId } : {}),
  });

  const handleConfirm = () => {
    onConfirm(buildPayload());
  };

  const handleDiscard = () => {
    onDiscard(buildPayload());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="new-chat-dialog-overlay" onClick={onCancel}>
      <div
        className="new-chat-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-dialog-title"
      >
        <div className="new-chat-dialog-header">
          <span id="new-chat-dialog-title" className="new-chat-dialog-title">
            {t("chat.newChatDialog.title")}
          </span>
          <button
            type="button"
            className="new-chat-dialog-close"
            onClick={onCancel}
            title={t("common.cancel")}
          >
            <X size={14} />
          </button>
        </div>

        <div className=”new-chat-dialog-body”>
          <p className=”new-chat-dialog-hint”>
            {t(“chat.newChatDialog.hint”)}
          </p>
          <input
            ref={inputRef}
            className=”new-chat-dialog-input”
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(“chat.newChatDialog.namePlaceholder”)}
          />
          <fieldset className="new-chat-dialog-session-fieldset">
            <legend className="new-chat-dialog-session-legend">
              {t("chat.newChatDialog.sessionKind")}
            </legend>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === "standard"}
                onChange={() => {
                  setSessionKind("standard");
                  setAgentPresetId("");
                }}
              />
              <span>
                <strong>Standard</strong> — {t("chat.newChatDialog.standard")}
              </span>
            </label>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === "guided"}
                onChange={() => setSessionKind("guided")}
              />
              <span>
                <strong>{t("chat.newChatDialog.guided")}</strong>
              </span>
            </label>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === "navi"}
                onChange={() => {
                  setSessionKind("navi");
                  setAgentPresetId("");
                }}
              />
              <span>
                <strong>Navi</strong> — {t("chat.newChatDialog.navi")}
              </span>
            </label>
          </fieldset>
          {sessionKind === "guided" && (
            <div className="new-chat-dialog-guided-extra">
              {agentPresets.length > 0 && (
                <>
                  <label
                    className="new-chat-dialog-plan-label"
                    htmlFor="new-chat-agent-preset"
                  >
                    {t("chat.newChatDialog.templateOptional")}
                  </label>
                  <select
                    id="new-chat-agent-preset"
                    className="new-chat-dialog-input"
                    value={agentPresetId}
                    onChange={(e) => setAgentPresetId(e.target.value)}
                  >
                    <option value="">— keine Vorlage —</option>
                    {agentPresets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.id})
                      </option>
                    ))}
                  </select>
                  <p className="new-chat-dialog-plan-hint">
                    Mit Vorlage werden Modus, LLM, Reasoning, deaktivierte
                    Toolkits und der Arbeitsplan aus den Projekteinstellungen
                    übernommen.
                  </p>
                </>
              )}
              {!agentPresetId && (
                <p className="new-chat-dialog-plan-hint">
                  Ohne Vorlage gelten Modus, gewähltes LLM und Tool-Leiste wie
                  in der Chat-Kopfzeile und werden beim Start übernommen.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="new-chat-dialog-footer">
          <button
            type="button"
            className="new-chat-dialog-btn-secondary"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
          <div className="new-chat-dialog-footer-actions">
            <button
              type="button"
              className="new-chat-dialog-btn-danger"
              onClick={handleDiscard}
              title={t("chat.newChatDialog.discardHint") || "Delete and start new"}
            >
              <Trash2 size={13} />
              {t("chat.newChatDialog.discard")}
            </button>
            <button
              type="button"
              className="new-chat-dialog-btn-primary"
              onClick={handleConfirm}
            >
              <Plus size={13} />
              {t("chat.newChatDialog.title")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
