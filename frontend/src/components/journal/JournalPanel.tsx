import { useCallback, useEffect, useState } from "react";
import { BookText, RefreshCw, X, AlertTriangle } from "lucide-react";
import { journalApi } from "../../api.ts";
import type { JournalData } from "../../types.ts";

interface JournalPanelProps {
  open: boolean;
  onClose: () => void;
}

/** CSS modifier suffix for the colored type badge. Unknown types fall back to "idee". */
function badgeKind(type: string): string {
  switch (type.toUpperCase()) {
    case "KANON":
      return "kanon";
    case "NEU":
      return "neu";
    case "WIDERSPRUCH":
      return "widerspruch";
    case "IDEE":
      return "idee";
    default:
      return "idee";
  }
}

/**
 * Read-only view of the project journal (.assistant/journal/*.md + _conflicts.md).
 * Makes the assistant's autonomously persisted facts (journal_log / flag_conflict)
 * visible so the chat itself can stay disposable.
 */
export function JournalPanel({ open, onClose }: JournalPanelProps) {
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await journalApi.read());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isEmpty =
    !loading &&
    !error &&
    data !== null &&
    data.days.length === 0 &&
    data.conflicts.length === 0;

  return (
    <div className="journal-overlay" onClick={onClose}>
      <div
        className="journal-dialog"
        role="dialog"
        aria-labelledby="journal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="journal-header">
          <div className="journal-header-left">
            <BookText size={18} className="journal-header-icon" aria-hidden />
            <h2 id="journal-title" className="journal-title">
              Journal
            </h2>
          </div>
          <div className="journal-header-actions">
            <button
              type="button"
              className="journal-icon-btn"
              onClick={load}
              disabled={loading}
              title="Neu laden"
            >
              <RefreshCw size={15} className={loading ? "journal-spin" : ""} />
            </button>
            <button
              type="button"
              className="journal-icon-btn"
              onClick={onClose}
              title="Schließen"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <p className="journal-intro">
          Was die KI als dauerhaft festgehalten hat. Der Chat darf flüchtig sein —
          das hier und das Wiki sind die Wahrheit.
        </p>

        <div className="journal-body">
          {loading && <div className="journal-state">Lade…</div>}
          {error && <div className="journal-state journal-state--error">{error}</div>}

          {isEmpty && (
            <div className="journal-state">
              Noch nichts festgehalten. Sobald im Chat dauerhafte Fakten oder
              Entscheidungen entstehen, schreibt die KI sie hier mit.
            </div>
          )}

          {data && data.conflicts.length > 0 && (
            <section className="journal-section">
              <div className="journal-section-title journal-section-title--conflict">
                <AlertTriangle size={14} aria-hidden /> Widersprüche
              </div>
              <ul className="journal-list">
                {data.conflicts.map((c, i) => (
                  <li key={`c-${i}`} className="journal-conflict">
                    <span className="journal-when">{c.when}</span>
                    <span className="journal-text">{c.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data?.days.map((day) => (
            <section key={day.date} className="journal-section">
              <div className="journal-section-title">{day.date}</div>
              <ul className="journal-list">
                {day.entries.map((e, i) => (
                  <li key={`${day.date}-${i}`} className="journal-entry">
                    <span className="journal-time">{e.time}</span>
                    <span className={`journal-badge journal-badge--${badgeKind(e.type)}`}>
                      {e.type}
                    </span>
                    <span className="journal-text">{e.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
