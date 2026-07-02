import { useState, useEffect, useRef } from "react";
import { Clapperboard, Loader2, ExternalLink } from "lucide-react";
import type {
  EnsembleBeat,
  EnsembleCharacterInput,
  EnsembleProgressEvent,
  EnsembleSceneContext,
} from "../../types.ts";
import { getAppBridge } from "../../electron/bridge.ts";
import "./EnsembleRunButton.css";

interface EnsembleRunButtonProps {
  scene: EnsembleSceneContext;
  characters: EnsembleCharacterInput[];
  /** Opens the written result file in the editor. */
  onOpenFile?: (path: string) => void;
}

type Phase = "idle" | "running" | "prose" | "done" | "error";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "szene"
  );
}

/**
 * "Szene durchspielen": streams a director-orchestrated ensemble run (one LLM
 * per character) and shows the beats live as they arrive, then opens the
 * written result file.
 */
export function EnsembleRunButton({
  scene,
  characters,
  onOpenFile,
}: EnsembleRunButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [beats, setBeats] = useState<EnsembleBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Clean up any active subscription on unmount.
  useEffect(() => () => unsubRef.current?.(), []);

  // Auto-scroll the live feed as beats stream in.
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [beats, phase]);

  const running = phase === "running" || phase === "prose";
  const disabled = running || characters.length === 0;

  const handleRun = async () => {
    const bridge = getAppBridge();
    if (!bridge?.ensemble?.run) {
      setError("Ensemble-Funktion nicht verfügbar.");
      setPhase("error");
      return;
    }

    // Reset state for a fresh run.
    unsubRef.current?.();
    setBeats([]);
    setError(null);
    setResultPath(null);
    setPhase("running");

    try {
      const resultFile = `${slugify(scene.title ?? "szene")}_${Date.now().toString(36)}`;
      const { runId } = await bridge.ensemble.run({ scene, characters, resultFile });

      const sub = bridge.ensemble.onEvent(runId, (ev: EnsembleProgressEvent) => {
        switch (ev.phase) {
          case "beat":
            setBeats((prev) => [...prev, ev.beat]);
            break;
          case "prose":
            setPhase("prose");
            break;
          case "done":
            setPhase("done");
            if (ev.result?.path) {
              setResultPath(ev.result.path);
              onOpenFile?.(ev.result.path);
            }
            unsubRef.current?.();
            unsubRef.current = null;
            break;
          case "error":
            setError(ev.message || "Durchspiel fehlgeschlagen.");
            setPhase("error");
            unsubRef.current?.();
            unsubRef.current = null;
            break;
        }
      });
      unsubRef.current = sub.unsubscribe;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Durchspiel fehlgeschlagen.");
      setPhase("error");
    }
  };

  const statusLabel =
    phase === "running"
      ? "Charaktere spielen…"
      : phase === "prose"
        ? "Prosa wird geschrieben…"
        : phase === "done"
          ? "Fertig"
          : "";

  return (
    <div className="ensemble-run">
      <button
        type="button"
        className="ensemble-run-btn"
        onClick={handleRun}
        disabled={disabled}
        title={
          characters.length === 0
            ? "Füge der Szene mindestens einen Charakter hinzu"
            : "Charaktere spielen die Szene durch (je ein LLM pro Rolle)"
        }
      >
        {running ? <Loader2 size={13} className="spin" /> : <Clapperboard size={13} />}
        {running ? "Wird durchgespielt…" : "Szene durchspielen"}
      </button>

      {statusLabel && phase !== "error" && (
        <div className="ensemble-run-status">
          {running && <Loader2 size={11} className="spin" />}
          <span>{statusLabel}</span>
        </div>
      )}

      {beats.length > 0 && (
        <div className="ensemble-run-feed" ref={feedRef}>
          {beats.map((b, i) => (
            <div
              key={i}
              className={`ensemble-beat ensemble-beat--${b.kind}`}
            >
              {b.kind === "narration" ? (
                <em className="ensemble-beat-narration">{b.content}</em>
              ) : (
                <>
                  <span className="ensemble-beat-speaker">{b.speaker}</span>
                  {b.action && (
                    <span className="ensemble-beat-action"> ({b.action})</span>
                  )}
                  <span className="ensemble-beat-content"> {b.content}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === "done" && resultPath && (
        <button
          type="button"
          className="ensemble-run-open"
          onClick={() => onOpenFile?.(resultPath)}
        >
          <ExternalLink size={12} />
          Ergebnis öffnen
        </button>
      )}

      {error && <p className="ensemble-run-error">{error}</p>}
    </div>
  );
}
