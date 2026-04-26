import { useCallback, useEffect, useRef, useState } from "react";
import { GitMerge, X } from "lucide-react";
import "./ThreadSummaryModal.css";

export interface ThreadSummaryModalProps {
  open: boolean;
  threadTitle: string;
  parentTitle?: string | null;
  onClose: () => void;
  onConfirm: (focusInstructions?: string) => Promise<void>;
  isSummarizing: boolean;
}

export function ThreadSummaryModal({
  open,
  threadTitle,
  parentTitle,
  onClose,
  onConfirm,
  isSummarizing,
}: ThreadSummaryModalProps) {
  const [focusText, setFocusText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setFocusText("");
    setSubmitError(null);
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSummarizing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isSummarizing, onClose]);

  const handleConfirm = useCallback(async () => {
    const trimmed = focusText.trim();
    setSubmitError(null);
    try {
      await onConfirm(trimmed.length > 0 ? trimmed : undefined);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Zusammenfassung fehlgeschlagen.";
      setSubmitError(msg);
    }
  }, [focusText, onConfirm, onClose]);

  if (!open) return null;

  return (
    <div
      className="thread-summary-modal-overlay"
      onClick={isSummarizing ? undefined : onClose}
      role="presentation"
    >
      <div
        className="thread-summary-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="thread-summary-modal-title"
        aria-modal="true"
      >
        <div className="thread-summary-modal-header">
          <div className="thread-summary-modal-header-left">
            <GitMerge size={18} className="thread-summary-modal-icon" aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h2 id="thread-summary-modal-title" className="thread-summary-modal-title">
                Zusammenfassung an Parent
              </h2>
              {parentTitle ? (
                <p className="thread-summary-modal-subtitle" title={`${threadTitle} → ${parentTitle}`}>
                  {threadTitle} → {parentTitle}
                </p>
              ) : (
                <p className="thread-summary-modal-subtitle" title={threadTitle}>
                  {threadTitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="thread-summary-modal-close"
            onClick={onClose}
            disabled={isSummarizing}
            title="Schließen (Esc)"
            aria-label="Dialog schließen"
          >
            <X size={18} />
          </button>
        </div>
        <p className="thread-summary-modal-intro">
          Optional: Steuere, welche Aspekte des Threads in die Zusammenfassung sollen. Wenn du nichts einträgst,
          wird die Standard-Kurzfassung des gesamten sichtbaren Threads erzeugt (wie bisher ohne Fokus-Vorgaben).
        </p>
        {submitError ? (
          <p className="thread-summary-modal-error" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="thread-summary-modal-body">
          <label htmlFor="thread-summary-modal-focus">Deine Nachricht an die Zusammenfassung</label>
          <textarea
            ref={textareaRef}
            id="thread-summary-modal-focus"
            className="thread-summary-modal-textarea"
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            disabled={isSummarizing}
            placeholder="z. B. nur die Änderungen an Kapitel 3, keine Brainstorm-Ideen …"
            maxLength={4000}
            aria-describedby="thread-summary-modal-hint"
          />
          <p id="thread-summary-modal-hint" className="thread-summary-modal-hint">
            Mit Text: die KI nutzt den vollen Thread, formuliert die Zusammenfassung aber nach deinen Vorgaben.
            Ohne Text: gleiche Logik wie die allgemeine Zusammenfassung ohne eigenes Eingabefeld.
          </p>
        </div>
        <div className="thread-summary-modal-actions">
          <button
            type="button"
            className="thread-summary-modal-btn"
            onClick={onClose}
            disabled={isSummarizing}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="thread-summary-modal-btn thread-summary-modal-btn--primary"
            onClick={() => { void handleConfirm(); }}
            disabled={isSummarizing}
          >
            {isSummarizing ? "Wird erstellt…" : "Zusammenfassung senden (leer = Standard)"}
          </button>
        </div>
      </div>
    </div>
  );
}
