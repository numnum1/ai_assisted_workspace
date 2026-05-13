import { useState, useRef, useCallback } from "react";
import { Plus, Trash2, X } from "lucide-react";

export function NewChatDialog({
  onConfirmClicked,
  onCancelClicked,
}: {
    onConfirmClicked: (name: string, keepOld: boolean) => void
    onCancelClicked: () => void
}) {
  const [title, setTitle] = useState('New Chat');
  const inputRef = useRef<HTMLInputElement>(null);

  // TODO: Replace
  const [sessionKind] = useState<'standard' | 'guided'>('standard')
  const [agentPresets] = useState<{id: string, name: string}[]>([])
  const [agentPresetId] = useState('')

  const handleDiscardClicked = useCallback(() => {
    onConfirmClicked(title, false)
  }, [onConfirmClicked, title])

  const handleConfirmedClicked = useCallback(() => {
    onConfirmClicked(title, true)
  }, [onConfirmClicked, title])

  return (
    <div className="new-chat-dialog-overlay" onClick={onCancelClicked}>
      <div
        className="new-chat-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-dialog-title"
      >
        <div className="new-chat-dialog-header">
          <span id="new-chat-dialog-title" className="new-chat-dialog-title">
            Neuen Chat starten
          </span>
          <button
            type="button"
            className="new-chat-dialog-close"
            onClick={onCancelClicked}
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </div>

        <div className="new-chat-dialog-body">
          <p className="new-chat-dialog-hint">
            Mit „Neuer Chat starten" bleibt der aktuelle Chat unter dem Namen im
            Verlauf. Mit „Verwerfen" wird er gelöscht und erscheint dort nicht.
          </p>
          <input
            ref={inputRef}
            className="new-chat-dialog-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name des Chats…"
          />
          <fieldset className="new-chat-dialog-session-fieldset">
            <legend className="new-chat-dialog-session-legend">
              Sitzungsart
            </legend>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === "standard"}
                onChange={() => {
                  // TODO: sessionKind auf "standard" setzen, agentPresetId zurücksetzen
                }}
              />
              <span>
                <strong>Standard</strong> — freies Gespräch wie bisher
              </span>
            </label>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === "guided"}
                onChange={() => {
                  // TODO: sessionKind auf "guided" setzen
                }}
              />
              <span>
                <strong>Geführte Sitzung (Agent)</strong> — Arbeitsplan, Modus
                und Tool-Toggles werden für diese Sitzung gespeichert (LLM aus
                dem Modus)
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
                    Vorlage (optional)
                  </label>
                  <select
                    id="new-chat-agent-preset"
                    className="new-chat-dialog-input"
                    value={agentPresetId}
                    onChange={() => console.log('Selected changed')}
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
            onClick={onCancelClicked}
          >
            Abbrechen
          </button>
          <div className="new-chat-dialog-footer-actions">
            <button
              type="button"
              className="new-chat-dialog-btn-danger"
              onClick={handleDiscardClicked}
              title="Aktuellen Chat löschen und neu starten"
            >
              <Trash2 size={13} />
              Verwerfen
            </button>
            <button
              type="button"
              className="new-chat-dialog-btn-primary"
              onClick={handleConfirmedClicked}
            >
              <Plus size={13} />
              Neuer Chat starten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}