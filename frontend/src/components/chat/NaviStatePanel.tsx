import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  ArrowRight,
  FileText,
  SplitSquareHorizontal,
} from "lucide-react";
import {
  NAVI_CLIENT_STATES,
  getNaviClientState,
} from "./naviStateMachineClient.ts";
import { NAVI_STATES } from "../../naviStateMachine.ts";
import "./NaviStatePanel.css";

interface Props {
  naviStateId: string;
  naviResults?: Record<string, string>;
}

export function NaviStatePanel({ naviStateId, naviResults }: Props) {
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const current = getNaviClientState(naviStateId);
  const currentRaw = NAVI_STATES.find((s) => s.id === naviStateId);

  const isDone = (stateId: string) =>
    stateId !== naviStateId && Boolean(naviResults?.[stateId]);

  const resultEntries = Object.entries(naviResults ?? {}).filter(([, v]) =>
    v?.trim(),
  );

  return (
    <div className="navi-panel">
      {/* ── Section 1: Current State ────────────────────────── */}
      <div className="navi-section">
        <div className="navi-section-label">
          <FileText size={11} />
          State
        </div>

        <div className="navi-state-card">
          <div className="navi-state-card-header">
            <span className="navi-state-id-chip">{naviStateId}</span>
            <span className="navi-state-card-title">
              {current?.label ?? naviStateId}
            </span>
            <span
              className={`navi-persona-chip navi-persona-chip--${currentRaw?.persona ?? "full"}`}
            >
              {currentRaw?.persona ?? "full"}
            </span>
          </div>

          {current?.description && (
            <p className="navi-state-card-description">{current.description}</p>
          )}

          {currentRaw?.instruction && (
            <pre className="navi-instruction">{currentRaw.instruction}</pre>
          )}
        </div>

        {/* Work plan */}
        {current && current.workPlan.length > 0 && (
          <div className="navi-workplan">
            <div className="navi-workplan-label">
              <ClipboardList size={10} />
              Arbeitsplan (Gate)
            </div>
            <ul className="navi-workplan-list">
              {current.workPlan.map((item, i) => (
                <li key={i} className="navi-workplan-item">
                  <Circle size={8} className="navi-workplan-dot" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Section 2: Transitions ──────────────────────────── */}
      {currentRaw && currentRaw.transitions.length > 0 && (
        <div className="navi-section">
          <div className="navi-section-label">
            <ArrowRight size={11} />
            Übergänge
          </div>
          <div className="navi-transitions">
            {currentRaw.transitions.map((t, i) => {
              const target = getNaviClientState(t.to);
              return (
                <div key={i} className="navi-transition-row">
                  <div className="navi-transition-target">
                    <ArrowRight size={9} />
                    {target?.label ?? t.to}
                    <span className="navi-transition-id">({t.to})</span>
                  </div>
                  <div className="navi-transition-condition">{t.condition}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 3: State Flow ───────────────────────────── */}
      <div className="navi-section">
        <div className="navi-section-label">
          <SplitSquareHorizontal size={11} />
          Flow
        </div>
        <ol className="navi-stepper">
          {NAVI_CLIENT_STATES.map((s) => {
            const done = isDone(s.id);
            const active = s.id === naviStateId;
            const status = done ? "done" : active ? "active" : "upcoming";
            const result = naviResults?.[s.id];
            return (
              <li key={s.id} className={`navi-step navi-step--${status}`}>
                <span className="navi-step-dot" />
                <span className="navi-step-label">{s.label}</span>
                {result && (
                  <button
                    className="navi-step-result-btn"
                    onClick={() =>
                      setExpandedResult(
                        expandedResult === s.id ? null : s.id,
                      )
                    }
                    type="button"
                    title="Ergebnis anzeigen"
                  >
                    <CheckCircle2 size={10} />
                  </button>
                )}
                {expandedResult === s.id && result && (
                  <div className="navi-step-result-box">
                    {result
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((line, i) => (
                        <div key={i} className="navi-step-result-line">
                          {line.replace(/^[-•]\s*/, "")}
                        </div>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Section 4: Intermediate Results ────────────────── */}
      {resultEntries.length > 0 && (
        <div className="navi-section">
          <div className="navi-section-label">
            <CheckCircle2 size={11} />
            Zwischenergebnisse
          </div>
          <div className="navi-results">
            {resultEntries.map(([stateId, summary]) => {
              const clientState = getNaviClientState(stateId);
              return (
                <div key={stateId} className="navi-result-entry">
                  <div className="navi-result-entry-header">
                    <span className="navi-result-entry-id">{stateId}</span>
                    <span className="navi-result-entry-label">
                      {clientState?.label ?? stateId}
                    </span>
                  </div>
                  <div className="navi-result-entry-body">
                    {summary
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((line, i) => (
                        <div key={i} className="navi-result-entry-line">
                          {line.replace(/^[-•]\s*/, "")}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
