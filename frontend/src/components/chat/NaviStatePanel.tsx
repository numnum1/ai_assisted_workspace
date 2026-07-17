import { useState } from "react";
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
  History,
  Pencil,
  Sparkles,
} from "lucide-react";
import { getEffectiveSlots, getAllSlotLabels, getNaviState } from "../../naviStateMachine.ts";
import { useNaviStateConfig } from "../../hooks/useNaviStateConfig.ts";
import { NaviStateEditor } from "./NaviStateEditor.tsx";
import { DEFAULT_NAVI_PERSONA } from "../../naviPersona.ts";
import { conversationToMarkdown } from "./chatMarkdownExport.ts";
import type { NaviImprovementProposal } from "../../naviImprovement.ts";
import type { Conversation, NaviFacts, NaviTraceEntry } from "../../types.ts";
import "./NaviStatePanel.css";

interface Props {
  naviStateId: string;
  naviFacts?: NaviFacts;
  naviCoveredTips?: string[];
  naviTrace?: NaviTraceEntry[];
  conversation?: Conversation;
  llmId?: string | null;
}

export function NaviStatePanel({
  naviStateId,
  naviFacts,
  naviCoveredTips,
  naviTrace,
  conversation,
  llmId,
}: Props) {
  const {
    states,
    tips,
    persona,
    useCases,
    tools,
    improvementLlm,
    loading,
    error,
    saveStates,
    saveTips,
    savePersona,
    saveUseCases,
    saveTools,
    saveImprovementLlm,
    resetStates,
    resetTips,
    resetPersona,
    resetUseCases,
    resetTools,
    resetImprovementLlm,
    proposeImprovement,
    improving,
    improvementError,
  } = useNaviStateConfig();
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState<NaviImprovementProposal | null>(null);

  const hasRatedFeedback = conversation?.messages.some((m) => m.feedback) ?? false;

  const handleImprove = async () => {
    if (!conversation) return;
    const markdown = conversationToMarkdown(conversation);
    const result = await proposeImprovement(markdown, llmId ?? undefined);
    if (result) {
      setProposal(result);
      setEditing(true);
    }
  };

  const currentRaw = getNaviState(states, naviStateId);
  const currentSlots = getEffectiveSlots(states, naviStateId);
  const allSlotLabels = getAllSlotLabels(states);
  const filledSlotEntries = Object.entries(naviFacts?.slots ?? {}).filter(([, v]) => v?.trim());

  const currentIndex = states.findIndex((s) => s.id === naviStateId);
  const isDone = (stateId: string) => {
    const idx = states.findIndex((s) => s.id === stateId);
    return idx !== -1 && idx < currentIndex;
  };

  if (loading) {
    return <div className="navi-panel navi-panel--loading">Lade Navi-Konfiguration …</div>;
  }

  if (editing) {
    return (
      <div className="navi-panel">
        <NaviStateEditor
          initialStates={proposal?.states ?? states}
          initialTips={proposal?.tips ?? tips}
          initialPersona={proposal?.persona ?? persona ?? DEFAULT_NAVI_PERSONA}
          initialUseCases={proposal?.useCases ?? useCases}
          initialTools={proposal?.tools ?? tools}
          initialImprovementLlm={improvementLlm ?? { apiUrl: "", model: "", apiKeySet: false }}
          onSaveStates={saveStates}
          onSaveTips={saveTips}
          onSavePersona={savePersona}
          onSaveUseCases={saveUseCases}
          onSaveTools={saveTools}
          onSaveImprovementLlm={saveImprovementLlm}
          onResetStates={resetStates}
          onResetTips={resetTips}
          onResetPersona={resetPersona}
          onResetUseCases={resetUseCases}
          onResetTools={resetTools}
          onResetImprovementLlm={resetImprovementLlm}
          onClose={() => {
            setEditing(false);
            setProposal(null);
          }}
          improvementNotice={proposal}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="navi-panel">
      <div className="navi-section navi-section--toolbar">
        <button type="button" className="navi-edit-toggle" onClick={() => setEditing(true)}>
          <Pencil size={11} />
          Bearbeiten
        </button>
        <button
          type="button"
          className="navi-edit-toggle"
          disabled={!hasRatedFeedback || improving}
          title={
            hasRatedFeedback
              ? "Aus den bewerteten Antworten dieses Gesprächs einen Änderungsvorschlag erzeugen"
              : "Bewerte mindestens eine Antwort in diesem Gespräch, um einen Vorschlag zu erzeugen"
          }
          onClick={handleImprove}
        >
          <Sparkles size={11} />
          {improving ? "Erzeuge Vorschlag …" : "Aus Feedback verbessern"}
        </button>
      </div>
      {improvementError && (
        <div className="navi-section navi-improvement-error">{improvementError}</div>
      )}

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
              {currentRaw?.label ?? naviStateId}
            </span>
            <span
              className={`navi-persona-chip navi-persona-chip--${currentRaw?.persona ?? "full"}`}
            >
              {currentRaw?.persona ?? "full"}
            </span>
          </div>

          {currentRaw?.description && (
            <p className="navi-state-card-description">{currentRaw.description}</p>
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

      {/* ── Section 1a2: Begründung — warum wurde die letzte Frage/Phase so gewählt? ── */}
      {naviTrace && naviTrace.length > 0 && (
        <div className="navi-section">
          <div className="navi-section-label">
            <History size={11} />
            Begründung (letzte Turns)
          </div>
          <div className="navi-trace-list">
            {[...naviTrace].reverse().map((entry, i) => (
              <div key={`${entry.at}-${i}`} className="navi-trace-entry">
                <div className="navi-trace-entry-header">
                  <span className="navi-state-id-chip">{entry.stateId}</span>
                  <span className="navi-trace-time">
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>
                </div>

                {entry.redirectTo && (
                  <div className="navi-trace-row navi-trace-row--redirect">
                    Themenwechsel erkannt → <strong>{entry.redirectTo}</strong>
                  </div>
                )}

                {entry.advancePhaseAttempts?.map((a, j) => (
                  <div
                    key={j}
                    className={`navi-trace-row navi-trace-row--${a.accepted ? "accepted" : "rejected"}`}
                  >
                    advance_phase → <strong>{a.target}</strong>:{" "}
                    {a.accepted
                      ? "akzeptiert"
                      : `abgelehnt (noch offen: ${a.openSlots.join(", ") || "—"})`}
                  </div>
                ))}

                {entry.factsChanged.length > 0 && (
                  <div className="navi-trace-row">
                    <span className="navi-trace-row-label">Neu erfasst (update_facts):</span>
                    <ul className="navi-trace-facts-list">
                      {entry.factsChanged.map((f, j) => (
                        <li key={j}>
                          {f.label}: <strong>{f.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.openSlots.length > 0 && (
                  <div className="navi-trace-row">
                    <span className="navi-trace-row-label">Offene Slots bei dieser Antwort:</span>{" "}
                    {entry.openSlots.join(", ")}
                  </div>
                )}

                {entry.factsChanged.length === 0 &&
                  !entry.redirectTo &&
                  !entry.advancePhaseAttempts?.length &&
                  entry.openSlots.length === 0 && (
                    <div className="navi-trace-row navi-trace-row--empty">
                      Keine neuen Fakten, kein Phasenwechsel versucht.
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

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
          {tips.map((tip) => {
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
              const target = getNaviState(states, t.to);
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
          {states.map((s) => {
            const done = isDone(s.id);
            const active = s.id === naviStateId;
            const status = done ? "done" : active ? "active" : "upcoming";
            return (
              <li key={s.id} className={`navi-step navi-step--${status}`}>
                <span className="navi-step-dot" />
                <span className="navi-step-label">{s.label ?? s.id}</span>
              </li>
            );
          })}
        </ol>
      </div>

    </div>
  );
}
