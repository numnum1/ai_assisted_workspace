import { useState } from "react";
import { ChevronRight, GitBranch, AlertTriangle } from "lucide-react";
import type { NaviTraceEntry } from "../../types.ts";
import "./NaviTurnTraceLine.css";

interface Props {
  entry: NaviTraceEntry;
  prevEntry?: NaviTraceEntry;
}

export function NaviTurnTraceLine({ entry, prevEntry }: Props) {
  const [open, setOpen] = useState(false);

  const accepted = entry.advancePhaseAttempts?.filter((a) => a.accepted) ?? [];
  const rejected = entry.advancePhaseAttempts?.filter((a) => !a.accepted) ?? [];
  const factsChanged = entry.factsChanged;

  const hypothesisChanged =
    !!entry.hypothesis && entry.hypothesis !== prevEntry?.hypothesis;
  const recommendationChanged =
    !!entry.recommendation && entry.recommendation !== prevEntry?.recommendation;

  const summaryParts: string[] = [];
  if (accepted.length > 0) {
    summaryParts.push(accepted.map((a) => a.target).join(" → "));
  }
  if (factsChanged.length > 0) {
    summaryParts.push(`${factsChanged.length} neue ${factsChanged.length === 1 ? "Fakt" : "Fakten"}`);
  }

  const hasAnything =
    accepted.length > 0 ||
    rejected.length > 0 ||
    factsChanged.length > 0 ||
    entry.openSlots.length > 0 ||
    hypothesisChanged ||
    recommendationChanged;

  return (
    <div className="navi-turn-trace">
      <button
        type="button"
        className="navi-turn-trace-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight
          size={12}
          className={`navi-turn-trace-chevron${open ? " navi-turn-trace-chevron--open" : ""}`}
          aria-hidden
        />
        <GitBranch size={12} className="navi-turn-trace-icon" aria-hidden />
        {hasAnything ? (
          <span className="navi-turn-trace-summary">
            {summaryParts.length > 0 ? summaryParts.join(" · ") : `Phase ${entry.stateId}`}
          </span>
        ) : (
          <span className="navi-turn-trace-summary navi-turn-trace-summary--empty">
            Phase {entry.stateId} · keine Änderung
          </span>
        )}
        {rejected.length > 0 && (
          <AlertTriangle size={12} className="navi-turn-trace-warn" aria-hidden />
        )}
      </button>

      {open && (
        <div className="navi-turn-trace-body">
          {accepted.length > 0 && (
            <div className="navi-turn-trace-row">
              <span className="navi-turn-trace-row-label">Phase</span>
              <span className="navi-turn-trace-row-value">
                {accepted.map((a) => a.target).join(" → ")}
              </span>
            </div>
          )}

          {rejected.map((a, i) => (
            <div key={i} className="navi-turn-trace-row navi-turn-trace-row--blocked">
              <span className="navi-turn-trace-row-label">Blockiert</span>
              <span className="navi-turn-trace-row-value">
                → {a.target} (noch offen: {a.openSlots.join(", ") || "—"})
              </span>
            </div>
          ))}

          {factsChanged.length > 0 && (
            <div className="navi-turn-trace-row">
              <span className="navi-turn-trace-row-label">Neu</span>
              <ul className="navi-turn-trace-facts">
                {factsChanged.map((f, i) => (
                  <li key={i}>
                    {f.label}: <strong>{f.value}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.openSlots.length > 0 && (
            <div className="navi-turn-trace-row">
              <span className="navi-turn-trace-row-label">Offen</span>
              <span className="navi-turn-trace-row-value">{entry.openSlots.join(", ")}</span>
            </div>
          )}

          {hypothesisChanged && (
            <div className="navi-turn-trace-row">
              <span className="navi-turn-trace-row-label">Hypothese</span>
              <span className="navi-turn-trace-row-value">{entry.hypothesis}</span>
            </div>
          )}

          {recommendationChanged && (
            <div className="navi-turn-trace-row">
              <span className="navi-turn-trace-row-label">Empfehlung</span>
              <span className="navi-turn-trace-row-value">{entry.recommendation}</span>
            </div>
          )}

          {!hasAnything && (
            <div className="navi-turn-trace-row navi-turn-trace-row--empty">
              Keine neuen Fakten, kein Phasenwechsel versucht.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
