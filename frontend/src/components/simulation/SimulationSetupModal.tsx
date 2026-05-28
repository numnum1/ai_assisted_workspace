import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2 } from "lucide-react";
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function nameFromWikiPath(wikiPath: string): string {
  const base = wikiPath.split("/").pop() ?? wikiPath;
  return base.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

export function SimulationSetupModal({
  onConfirm,
  onCancel,
}: SimulationSetupModalProps) {
  const [filePath, setFilePath] = useState("");
  const [loadedChars, setLoadedChars] = useState<SimulationCharacter[]>([]);
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);

  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");

  const goalRef = useRef<HTMLTextAreaElement>(null);
  const filePathRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    filePathRef.current?.focus();
  }, []);

  const loadFile = useCallback(async () => {
    const path = filePath.trim();
    if (!path) return;
    setLoading(true);
    setLoadError(null);
    setFileLoaded(false);
    setLoadedChars([]);
    setSelectedChars(new Set());
    try {
      const bridge = getAppBridge();
      if (!bridge?.typedFiles) {
        setLoadError("Datei-Zugriff nicht verfügbar.");
        return;
      }
      const result = await bridge.typedFiles.getContent(path);
      const data = result.data as Record<string, unknown>;

      // Support both "Charactere" and "characters" field names
      const rawChars =
        (data["Charactere"] as unknown) ??
        (data["characters"] as unknown) ??
        (data["Characters"] as unknown);

      if (!Array.isArray(rawChars) || rawChars.length === 0) {
        setLoadError(
          'Kein "Charactere"-Feld gefunden oder leer. Stelle sicher, dass die Datei ein "Charactere"-Array mit Wiki-Pfaden enthält.',
        );
        setFileLoaded(true);
        return;
      }

      const chars: SimulationCharacter[] = (rawChars as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((wikiPath) => ({
          wikiPath: wikiPath.trim(),
          name: nameFromWikiPath(wikiPath.trim()),
        }));

      setLoadedChars(chars);
      setSelectedChars(new Set(chars.map((c) => c.wikiPath)));
      setFileLoaded(true);
    } catch (err) {
      setLoadError(`Fehler beim Laden: ${String(err)}`);
      setFileLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  const toggleChar = (wikiPath: string) => {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(wikiPath)) next.delete(wikiPath);
      else next.add(wikiPath);
      return next;
    });
  };

  const handleConfirm = () => {
    const trimGoal = goal.trim();
    if (!trimGoal) return;
    const trimPath = filePath.trim();
    const characters = loadedChars.filter((c) =>
      selectedChars.has(c.wikiPath),
    );
    const slug = slugify(trimGoal);
    const ts = Date.now().toString(36);
    const resultFile = `${slug}_${ts}`;
    const labelParts = trimPath.split("/");
    const baseFileLabel = labelParts[labelParts.length - 1] ?? trimPath;

    const simulationConfig: SimulationConfig = {
      goal: trimGoal,
      baseFilePath: trimPath,
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
          {/* Base file */}
          <label className="sim-modal-label" htmlFor="sim-base-file">
            Basis-Datei <span className="sim-modal-hint-inline">(relativer Pfad, z.B. chapters/kap-01/szene-01.scene.json)</span>
          </label>
          <div className="sim-modal-file-row">
            <input
              ref={filePathRef}
              id="sim-base-file"
              className="sim-modal-input"
              value={filePath}
              onChange={(e) => {
                setFilePath(e.target.value);
                setFileLoaded(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadFile();
                if (e.key === "Escape") onCancel();
              }}
              placeholder="chapters/…/szene.scene.json"
            />
            <button
              type="button"
              className="sim-modal-load-btn"
              onClick={loadFile}
              disabled={!filePath.trim() || loading}
              title="Charaktere laden"
            >
              {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
              Laden
            </button>
          </div>

          {/* Characters */}
          {fileLoaded && (
            <div className="sim-modal-chars-section">
              {loadError ? (
                <p className="sim-modal-error">{loadError}</p>
              ) : loadedChars.length === 0 ? (
                <p className="sim-modal-hint">Keine Charaktere gefunden.</p>
              ) : (
                <>
                  <p className="sim-modal-label">
                    Charaktere <span className="sim-modal-hint-inline">({loadedChars.length} gefunden)</span>
                  </p>
                  <div className="sim-modal-chars-list">
                    {loadedChars.map((c) => (
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
            Titel des Chats <span className="sim-modal-hint-inline">(optional)</span>
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
            Das Ergebnis wird unter <code>.assistant/simulations/</code> gespeichert.
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
