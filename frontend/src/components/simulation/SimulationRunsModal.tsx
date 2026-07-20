import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { NaviSimulationRunRecord } from "../../types.ts";
import { getAppBridge } from "../../electron/bridge.ts";
import "./SimulationSetupModal.css";
import "./SimulationRunsModal.css";

interface SimulationRunsModalProps {
  onCancel: () => void;
}

function scoreClass(score: number): string {
  if (score < 0) return "unknown";
  if (score >= 70) return "good";
  if (score >= 40) return "mid";
  return "bad";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SimulationRunsModal({ onCancel }: SimulationRunsModalProps) {
  const [runs, setRuns] = useState<NaviSimulationRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getAppBridge();
    if (!bridge?.simulation?.listRuns) {
      setLoading(false);
      return;
    }
    bridge.simulation
      .listRuns()
      .then((list) => {
        setRuns(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = runs.find((r) => r.id === selectedId) ?? null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="sim-modal-overlay" onClick={onCancel} onKeyDown={handleKeyDown}>
      <div
        className="sim-modal sim-runs-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-runs-modal-title"
      >
        <div className="sim-modal-header">
          <span id="sim-runs-modal-title" className="sim-modal-title">
            Navi-Simulationsläufe
          </span>
          <button type="button" className="sim-modal-close" onClick={onCancel} title="Schließen">
            <X size={14} />
          </button>
        </div>

        <div className="sim-runs-body">
          <div className="sim-runs-list">
            {loading ? (
              <div className="sim-modal-loading-row">
                <Loader2 size={14} className="spin" />
                <span className="sim-modal-hint">Wird geladen…</span>
              </div>
            ) : runs.length === 0 ? (
              <p className="sim-runs-list-empty">
                Noch keine abgeschlossenen Simulationsläufe vorhanden.
              </p>
            ) : (
              runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={`sim-run-row${run.id === selectedId ? " active" : ""}`}
                  onClick={() => setSelectedId(run.id)}
                >
                  <div className="sim-run-row-top">
                    <span className="sim-run-row-name">
                      {run.personaName || run.persona.slice(0, 40) || "Simulation"}
                    </span>
                    <span className={`sim-run-score-badge ${scoreClass(run.score)}`}>
                      {run.score >= 0 ? run.score : "—"}
                    </span>
                  </div>
                  <span className="sim-run-row-date">{formatDate(run.createdAt)}</span>
                  {run.finalStateId && (
                    <span className="sim-run-row-state">Endzustand: {run.finalStateId}</span>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="sim-runs-detail">
            {!selected ? (
              <div className="sim-runs-detail-empty">
                {runs.length === 0 ? "Kein Lauf ausgewählt." : "Lauf auswählen…"}
              </div>
            ) : (
              <>
                <div>
                  <p className="sim-runs-detail-section-title">Bewertung</p>
                  <div className="sim-runs-report">{selected.report}</div>
                </div>
                <div>
                  <p className="sim-runs-detail-section-title">Gesprächsprotokoll</p>
                  <div className="sim-runs-transcript">
                    {selected.transcript.map((line, i) => (
                      <div key={i} className={`sim-runs-transcript-line ${line.speaker}`}>
                        <span className="sim-runs-transcript-speaker">
                          {line.speaker === "navi" ? "Navi" : "Händler"}
                        </span>
                        {line.content}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
