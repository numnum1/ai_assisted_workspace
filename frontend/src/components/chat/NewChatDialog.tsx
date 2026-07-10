import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";

export interface NewChatConfirmPayload {
  title: string;
  newTitle: string;
}

interface NewChatDialogProps {
  currentTitle: string;
  onConfirm: (payload: NewChatConfirmPayload) => void;
  onDiscard: (payload: NewChatConfirmPayload) => void;
  onCancel: () => void;
}

export function NewChatDialog({
  currentTitle,
  onConfirm,
  onDiscard,
  onCancel,
}: NewChatDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [newTitle, setNewTitle] = useState("");
  const newTitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    newTitleInputRef.current?.focus();
    newTitleInputRef.current?.select();
  }, []);

  const buildPayload = (): NewChatConfirmPayload => ({
    title: title.trim() || currentTitle,
    newTitle: newTitle.trim(),
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
            Neuen Chat starten
          </span>
          <button
            type="button"
            className="new-chat-dialog-close"
            onClick={onCancel}
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </div>

        <div className="new-chat-dialog-body">
          <label className="new-chat-dialog-label" htmlFor="new-chat-dialog-new-title">
            Name des neuen Chats
          </label>
          <input
            id="new-chat-dialog-new-title"
            ref={newTitleInputRef}
            className="new-chat-dialog-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Neuer Chat…"
          />

          <p className="new-chat-dialog-hint">
            Mit „Neuer Chat starten“ bleibt der aktuelle Chat unter dem Namen im
            Verlauf. Mit „Verwerfen“ wird er gelöscht und erscheint dort nicht.
          </p>
          <label className="new-chat-dialog-label" htmlFor="new-chat-dialog-title-input">
            Aktuellen Chat umbenennen
          </label>
          <input
            id="new-chat-dialog-title-input"
            className="new-chat-dialog-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name des Chats…"
          />
        </div>

        <div className="new-chat-dialog-footer">
          <button
            type="button"
            className="new-chat-dialog-btn-secondary"
            onClick={onCancel}
          >
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
            <button
              type="button"
              className="new-chat-dialog-btn-primary"
              onClick={handleConfirm}
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
