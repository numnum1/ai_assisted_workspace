import { useState, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { SimulationConfig, SimulationCharacter } from "../../types.ts";
import { getAppBridge } from "../../electron/bridge.ts";
import "./SimulationSetupModal.css";

export interface SimulationSetupResult {
  title: string;
  simulationConfig: SimulationConfig;
}

interface SimulationSetupModalProps {
  onConfirm: (result: SimulationSetupResult) => void;
  onCancel: () => void;
}

interface BookEntry {
  structureRoot: string | null;
  label: string;
  characters: SimulationCharacter[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function SimulationSetupModal({
  onConfirm,
  onCancel,
}: SimulationSetupModalProps) {
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());

  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");

  const goalRef = useRef<HTMLTextAreaElement>(null);

  // Load books on mount
  useEffect(() => {
    const bridge = getAppBridge();
    if (!bridge?.simulation?.listBooks) {
      setBooksError("Simulation-Zugriff nicht verfügbar.");
      setBooksLoading(false);
      return;
    }
    bridge.simulation
      .listBooks()
      .then((entries) => {
        setBooks(entries);
        if (entries.length > 0) {
          setSelectedIdx(0);
          setSelectedChars(new Set(entries[0].characters.map((c) => c.wikiPath)));
        }
      })
      .catch((err: unknown) => {
        setBooksError(`Fehler: ${String(err)}`);
      })
      .finally(() => setBooksLoading(false));
  }, []);

  // Update selected characters when book selection changes
  const handleBookChange = (idx: number) => {
    setSelectedIdx(idx);
    if (books[idx]) {
      setSelectedChars(new Set(books[idx].characters.map((c) => c.wikiPath)));
    }
  };

  const toggleChar = (wikiPath: string) => {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(wikiPath)) next.delete(wikiPath);
      else next.add(wikiPath);
      return next;
    });
  };

  const selectedBook = books[selectedIdx] ?? null;

  const handleConfirm = () => {
    const trimGoal = goal.trim();
    if (!trimGoal) return;

    const characters = (selectedBook?.characters ?? []).filter((c) =>
      selectedChars.has(c.wikiPath),
    );
    const slug = slugify(trimGoal);
    const ts = Date.now().toString(36);
    const resultFile = `${slug}_${ts}`;

    const structureRoot = selectedBook?.structureRoot ?? null;
    const baseFilePath = structureRoot ? `${structureRoot}/.project/book.json` : ".project/book.json";
    const baseFileLabel = selectedBook?.label ?? "Projekt";

    const simulationConfig: SimulationConfig = {
      goal: trimGoal,
      baseFilePath,
      baseFileLabel,
      characters,
      resultFile,
    };
    onConfirm({
      title: title.trim() || `Simulation: ${trimGoal.slice(0, 50)}`,
      simulationConfig,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  const canConfirm = goal.trim().length > 0;

  return (
    <div
      className="sim-modal-overlay"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="sim-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-modal-title"
      >
        {/* Header */}
        <div className="sim-modal-header">
          <span id="sim-modal-title" className="sim-modal-title">
            Neue Simulation
          </span>
          <button
            type="button"
            className="sim-modal-close"
            onClick={onCancel}
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </div>

        <div className="sim-modal-body">
          {/* Book selection */}
          <label className="sim-modal-label" htmlFor="sim-base-book">
            Buch / Projekt
          </label>
          {booksLoading ? (
            <div className="sim-modal-loading-row">
              <Loader2 size={14} className="spin" />
              <span className="sim-modal-hint">Wird geladen…</span>
            </div>
          ) : booksError ? (
            <p className="sim-modal-error">{booksError}</p>
          ) : books.length === 0 ? (
            <p className="sim-modal-hint">Kein Projekt gefunden.</p>
          ) : (
            <select
              id="sim-base-book"
              className="sim-modal-select"
              value={selectedIdx}
              onChange={(e) => handleBookChange(Number(e.target.value))}
            >
              {books.map((b, i) => (
                <option key={i} value={i}>
                  {b.label}
                </option>
              ))}
            </select>
          )}

          {/* Characters */}
          {selectedBook && (
            <div className="sim-modal-chars-section">
              {selectedBook.characters.length === 0 ? (
                <p className="sim-modal-hint">
                  Keine Charaktere eingetragen. Trage Charaktere im Buch-MetaPanel ein.
                </p>
              ) : (
                <>
                  <p className="sim-modal-label">
                    Charaktere{" "}
                    <span className="sim-modal-hint-inline">
                      ({selectedBook.characters.length} gefunden)
                    </span>
                  </p>
                  <div className="sim-modal-chars-list">
                    {selectedBook.characters.map((c) => (
                      <label key={c.wikiPath} className="sim-modal-char-row">
                        <input
                          type="checkbox"
                          checked={selectedChars.has(c.wikiPath)}
                          onChange={() => toggleChar(c.wikiPath)}
                        />
                        <span className="sim-modal-char-name">{c.name}</span>
                        <span className="sim-modal-char-path">{c.wikiPath}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Goal */}
          <label className="sim-modal-label" htmlFor="sim-goal">
            Ziel <span className="sim-modal-required">*</span>
          </label>
          <textarea
            ref={goalRef}
            id="sim-goal"
            className="sim-modal-textarea"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Was möchtest du in dieser Sitzung herausarbeiten? z.B. »Den Charakter-Arc zwischen A und B ausarbeiten«"
            rows={3}
          />

          {/* Title */}
          <label className="sim-modal-label" htmlFor="sim-title">
            Titel des Chats{" "}
            <span className="sim-modal-hint-inline">(optional)</span>
          </label>
          <input
            id="sim-title"
            className="sim-modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Wird aus dem Ziel abgeleitet, wenn leer"
          />

          <p className="sim-modal-result-hint">
            Das Ergebnis wird unter{" "}
            <code>.assistant/simulations/</code> gespeichert.
          </p>
        </div>

        {/* Footer */}
        <div className="sim-modal-footer">
          <button
            type="button"
            className="sim-modal-btn-secondary"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="sim-modal-btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Simulation starten
          </button>
        </div>
      </div>
    </div>
  );
}
