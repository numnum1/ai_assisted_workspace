import { useState, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';

interface NewChatDialogProps {
  currentTitle: string;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export function NewChatDialog({ currentTitle, onConfirm, onCancel }: NewChatDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleConfirm = () => {
    onConfirm(title.trim() || currentTitle);
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
            Den aktuellen Chat unter diesem Namen im Verlauf speichern?
          </p>
          <input
            ref={inputRef}
            className="new-chat-dialog-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name des Chats…"
          />
        </div>

        <div className="new-chat-dialog-footer">
          <button type="button" className="new-chat-dialog-btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="new-chat-dialog-btn-primary" onClick={handleConfirm}>
            <Plus size={13} />
            Neuer Chat starten
          </button>
        </div>
      </div>
    </div>
  );
}
