import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import "./TextPromptDialog.css";

interface TextPromptDialogProps {
  title: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function TextPromptDialog({
  title,
  defaultValue = "",
  onConfirm,
  onCancel,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleConfirm();
  };

  return (
    <div className="text-prompt-overlay" onClick={onCancel}>
      <div
        className="text-prompt-dialog"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-prompt-header">
          <span className="text-prompt-title">{title}</span>
          <button
            type="button"
            className="text-prompt-close"
            onClick={onCancel}
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </div>
        <div className="text-prompt-body">
          <input
            ref={inputRef}
            className="text-prompt-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="text-prompt-footer">
          <button
            type="button"
            className="text-prompt-btn-cancel"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="text-prompt-btn-confirm"
            onClick={handleConfirm}
            disabled={!value.trim()}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
