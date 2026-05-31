import { useState } from "react";
import { ChevronRight, CheckCircle2, Circle, ClipboardList } from "lucide-react";
import {
  NAVI_CLIENT_STATES,
  getNaviClientState,
} from "./naviStateMachineClient.ts";
import "./NaviStatePanel.css";

interface Props {
  naviStateId: string;
  naviResults?: Record<string, string>;
}

export function NaviStatePanel({ naviStateId, naviResults }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const current = getNaviClientState(naviStateId);

  // A state is "done" if it has an accumulated result — works for non-linear paths.
  // The current active state is never "done" even if it has a result from a previous pass.
  const isDone = (stateId: string) =>
    stateId !== naviStateId && Boolean(naviResults?.[stateId]);

  const completedCount = Object.keys(naviResults ?? {}).length;

  return (
    <div className="navi-state-panel">
      <button
        className={`navi-state-header${open ? " navi-state-header--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <ChevronRight
          size={12}
          className={`navi-state-chevron${open ? " navi-state-chevron--open" : ""}`}
        />
        <span className="navi-state-chip">Navi</span>
        <span className="navi-state-current-label">
          {current?.label ?? naviStateId}
        </span>
        {completedCount > 0 && (
          <span className="navi-state-results-badge">
            {completedCount} Ergebnis{completedCount !== 1 ? "se" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="navi-state-body">
          {current && (
            <p className="navi-state-description">{current.description}</p>
          )}

          {/* Work plan for current state */}
          {current && current.workPlan.length > 0 && (
            <div className="navi-state-workplan">
              <span className="navi-state-section-label">
                <ClipboardList size={11} />
                Arbeitsplan
              </span>
              <ul className="navi-state-workplan-list">
                {current.workPlan.map((item, i) => (
                  <li key={i} className="navi-state-workplan-item">
                    <Circle size={9} className="navi-state-workplan-dot" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* State stepper */}
          <ol className="navi-state-stepper">
            {NAVI_CLIENT_STATES.map((s) => {
              const done = isDone(s.id);
              const active = s.id === naviStateId;
              const status = done ? "done" : active ? "active" : "upcoming";
              const result = naviResults?.[s.id];
              return (
                <li key={s.id} className={`navi-state-step navi-state-step--${status}`}>
                  <span className="navi-state-step-dot" />
                  <span className="navi-state-step-label">{s.label}</span>
                  {result && (
                    <button
                      className="navi-state-result-toggle"
                      onClick={() =>
                        setExpandedResult(expandedResult === s.id ? null : s.id)
                      }
                      type="button"
                      title="Ergebnis anzeigen"
                    >
                      <CheckCircle2 size={11} />
                    </button>
                  )}
                  {expandedResult === s.id && result && (
                    <div className="navi-state-result-box">
                      {result
                        .split("\n")
                        .filter((l) => l.trim())
                        .map((line, i) => (
                          <div key={i} className="navi-state-result-line">
                            {line.replace(/^-\s*/, "")}
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Possible transitions from current state */}
          {current && current.transitions.length > 0 && (
            <div className="navi-state-transitions">
              <span className="navi-state-transitions-label">Weiter zu:</span>
              {current.transitions.map((t) => (
                <span key={`${t.to}-${t.label}`} className="navi-state-transition-chip">
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
