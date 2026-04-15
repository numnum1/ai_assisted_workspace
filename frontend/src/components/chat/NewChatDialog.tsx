import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { AgentPreset, ChatSessionKind } from '../../types.ts';

export interface NewChatConfirmPayload {
  title: string;
  sessionKind: ChatSessionKind;
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
  const [title, setTitle] = useState(currentTitle);
  const [sessionKind, setSessionKind] = useState<ChatSessionKind>('standard');
  const [agentPresetId, setAgentPresetId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const buildPayload = (): NewChatConfirmPayload => ({
    title: title.trim() || currentTitle,
    sessionKind,
    ...(sessionKind === 'guided' && agentPresetId ? { agentPresetId } : {}),
  });

  const handleConfirm = () => {
    onConfirm(buildPayload());
  };

  const handleDiscard = () => {
    onDiscard(buildPayload());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancel();
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
            Neuen Chat starten
          </span>
          <button type="button" className="new-chat-dialog-close" onClick={onCancel} title="Abbrechen">
            <X size={14} />
          </button>
        </div>

        <div className="new-chat-dialog-body">
          <p className="new-chat-dialog-hint">
            Mit „Neuer Chat starten“ bleibt der aktuelle Chat unter dem Namen im Verlauf. Mit
            „Verwerfen“ wird er gelöscht und erscheint dort nicht.
          </p>
          <input
            ref={inputRef}
            className="new-chat-dialog-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name des Chats…"
          />
          <fieldset className="new-chat-dialog-session-fieldset">
            <legend className="new-chat-dialog-session-legend">Sitzungsart</legend>
            <label className="new-chat-dialog-radio-row">
              <input
                type="radio"
                name="sessionKind"
                checked={sessionKind === 'standard'}
                onChange={() => {
                  setSessionKind('standard');
                  setAgentPresetId('');
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
                checked={sessionKind === 'guided'}
                onChange={() => setSessionKind('guided')}
              />
              <span>
                <strong>Geführte Sitzung (Agent)</strong> — Modus, LLM und Tool-Toggles werden für diese Sitzung
                gespeichert
              </span>
            </label>
          </fieldset>
          {sessionKind === 'guided' && agentPresets.length > 0 && (
            <div className="new-chat-dialog-guided-extra">
              <label className="new-chat-dialog-plan-label" htmlFor="new-chat-agent-preset">
                Vorlage (optional)
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
                Mit Vorlage werden Modus, LLM, Reasoning und deaktivierte Toolkits aus den Projekteinstellungen
                übernommen.
              </p>
            </div>
          )}
        </div>

        <div className="new-chat-dialog-footer">
          <button type="button" className="new-chat-dialog-btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <div className="new-chat-dialog-footer-actions">
            <button
              type="button"
              className="new-chat-dialog-btn-danger"
              onClick={handleDiscard}
              title="Aktuellen Chat löschen und neu starten"
            >
              <Trash2 size={13} />
              Verwerfen
            </button>
            <button type="button" className="new-chat-dialog-btn-primary" onClick={handleConfirm}>
              <Plus size={13} />
              Neuer Chat starten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
