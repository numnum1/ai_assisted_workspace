import {
  CheckCircle2,
  Circle,
  ClipboardList,
  ArrowRight,
  FileText,
  Lightbulb,
  SplitSquareHorizontal,
  Inbox,
  BookOpen,
} from "lucide-react";
import {
  NAVI_CLIENT_STATES,
  getNaviClientState,
} from "./naviStateMachineClient.ts";
import { NAVI_STATES, getEffectiveSlots, getAllSlotLabels } from "../../naviStateMachine.ts";
import { NAVI_TIPS } from "../../naviTips.ts";
import type { NaviFacts } from "../../types.ts";
import "./NaviStatePanel.css";

interface Props {
  naviStateId: string;
  naviFacts?: NaviFacts;
  naviCoveredTips?: string[];
}

export function NaviStatePanel({ naviStateId, naviFacts, naviCoveredTips }: Props) {
  const current = getNaviClientState(naviStateId);
  const currentRaw = NAVI_STATES.find((s) => s.id === naviStateId);
  const currentSlots = getEffectiveSlots(naviStateId, undefined);
  const allSlotLabels = getAllSlotLabels(undefined);
  const filledSlotEntries = Object.entries(naviFacts?.slots ?? {}).filter(([, v]) => v?.trim());

  const currentIndex = NAVI_CLIENT_STATES.findIndex((s) => s.id === naviStateId);
  const isDone = (stateId: string) => {
    const idx = NAVI_CLIENT_STATES.findIndex((s) => s.id === stateId);
    return idx !== -1 && idx < currentIndex;
  };

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

        {/* Slot checklist — always current, filled directly by update_facts each turn */}
        {currentSlots.length > 0 && (
          <div className="navi-workplan">
            <div className="navi-workplan-label">
              <ClipboardList size={10} />
              Slot-Checkliste (Gate)
            </div>
            <ul className="navi-workplan-list">
              {currentSlots.map((slot) => {
                const value = naviFacts?.slots[slot.id]?.trim();
                return (
                  <li key={slot.id} className="navi-workplan-item">
                    {value ? (
                      <CheckCircle2 size={10} className="navi-workplan-dot navi-workplan-dot--filled" />
                    ) : (
                      <Circle size={8} className="navi-workplan-dot" />
                    )}
                    <span>
                      {slot.label}
                      {value && <span className="navi-context-value"> → {value}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── Section 1b: Problem Queue ──────────────────────── */}
      {naviFacts?.currentProblem && (
        <div className="navi-section">
          <div className="navi-section-label">
            <Inbox size={11} />
            Probleme
          </div>
          <div className="navi-problem-queue">
            <div className="navi-problem-current">
              <CheckCircle2 size={10} className="navi-problem-icon navi-problem-icon--active" />
              <span className="navi-problem-label">{naviFacts.currentProblem}</span>
              <span className="navi-problem-badge">aktiv</span>
            </div>
            {(naviFacts.problemQueue ?? []).map((p, i) => (
              <div key={i} className="navi-problem-queued">
                <Circle size={10} className="navi-problem-icon" />
                <span className="navi-problem-label">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 1b2: Faktenlage — accumulated slot values across every phase ─── */}
      {(filledSlotEntries.length > 0 || naviFacts?.hypothesis || naviFacts?.recommendation || naviFacts?.notes) && (
        <div className="navi-section">
          <div className="navi-section-label">
            <BookOpen size={11} />
            Faktenlage
          </div>
          <div className="navi-context-card">
            {filledSlotEntries.map(([id, value]) => (
              <div className="navi-context-row" key={id}>
                <span className="navi-context-key">{allSlotLabels.get(id) ?? id}</span>
                <span className="navi-context-value">{value}</span>
              </div>
            ))}
            {naviFacts?.hypothesis && (
              <div className="navi-context-row">
                <span className="navi-context-key">Interpretation</span>
                <span className="navi-context-value">{naviFacts.hypothesis}</span>
              </div>
            )}
            {naviFacts?.recommendation && (
              <div className="navi-context-row">
                <span className="navi-context-key">Empfehlung</span>
                <span className="navi-context-value">{naviFacts.recommendation}</span>
              </div>
            )}
            {naviFacts?.notes && (
              <div className="navi-context-row">
                <span className="navi-context-key">Notizen</span>
                <span className="navi-context-value navi-context-value--details">
                  {naviFacts.notes.split("\n").filter((l) => l.trim()).map((line, i) => (
                    <div key={i}>{line.replace(/^[-•]\s*/, "")}</div>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section: Tips ──────────────────────────────────── */}
      <div className="navi-section">
        <div className="navi-section-label">
          <Lightbulb size={11} />
          Hinweise
        </div>
        <ul className="navi-tips-list">
          {NAVI_TIPS.map((tip) => {
            const covered = naviCoveredTips?.includes(tip.id) ?? false;
            return (
              <li key={tip.id} className={`navi-tip-item${covered ? " navi-tip-item--covered" : ""}`}>
                {covered ? <CheckCircle2 size={10} className="navi-tip-icon navi-tip-icon--covered" /> : <Circle size={10} className="navi-tip-icon" />}
                {tip.label}
              </li>
            );
          })}
        </ul>
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
            return (
              <li key={s.id} className={`navi-step navi-step--${status}`}>
                <span className="navi-step-dot" />
                <span className="navi-step-label">{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

    </div>
  );
}
