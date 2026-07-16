import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  X,
  AlertTriangle,
} from "lucide-react";
import { NAVI_INITIAL_STATE_ID, slugifySlotLabel, type NaviState, type NaviTransition, type NaviStateToolName } from "../../naviStateMachine.ts";
import type { NaviTip } from "../../naviTips.ts";
import "./NaviStateEditor.css";

const TOOL_OPTIONS: NaviStateToolName[] = ["ask_question", "ask_clarification", "ask_yes_no"];

function generateUniqueId(label: string, existingIds: Set<string>): string {
  const base = slugifySlotLabel(label);
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function isGatedNarrow(state: NaviState): boolean {
  return state.persona === "narrow" && state.workPlan.length > 0;
}

interface Props {
  initialStates: NaviState[];
  initialTips: NaviTip[];
  onSaveStates: (states: NaviState[]) => Promise<boolean>;
  onSaveTips: (tips: NaviTip[]) => Promise<boolean>;
  onResetStates: () => Promise<NaviState[]>;
  onResetTips: () => Promise<NaviTip[]>;
  onClose: () => void;
  error: string | null;
}

export function NaviStateEditor({
  initialStates,
  initialTips,
  onSaveStates,
  onSaveTips,
  onResetStates,
  onResetTips,
  onClose,
  error,
}: Props) {
  const [states, setStates] = useState<NaviState[]>(initialStates);
  const [tips, setTips] = useState<NaviTip[]>(initialTips);
  const [expandedId, setExpandedId] = useState<string | null>(states[0]?.id ?? null);
  const [savingStates, setSavingStates] = useState(false);
  const [savingTips, setSavingTips] = useState(false);

  const ids = states.map((s) => s.id);

  function updateState(id: string, patch: Partial<NaviState>) {
    setStates((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addState() {
    const label = "Neue Phase";
    const id = generateUniqueId(label, new Set(ids));
    const newState: NaviState = {
      id,
      label,
      description: "",
      persona: "narrow",
      instruction: "",
      workPlan: [],
      transitions: [],
      validation: { requiresQuestion: true },
    };
    setStates((prev) => [...prev, newState]);
    setExpandedId(id);
  }

  function removeState(id: string) {
    if (id === NAVI_INITIAL_STATE_ID) return;
    setStates((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s) => ({ ...s, transitions: s.transitions.filter((t) => t.to !== id) })),
    );
    if (expandedId === id) setExpandedId(null);
  }

  function moveState(index: number, direction: -1 | 1) {
    setStates((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addWorkPlanItem(stateId: string) {
    updateState(stateId, {
      workPlan: [...(states.find((s) => s.id === stateId)?.workPlan ?? []), ""],
    });
  }

  function updateWorkPlanItem(stateId: string, index: number, value: string) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    const next = [...state.workPlan];
    next[index] = value;
    updateState(stateId, { workPlan: next });
  }

  function removeWorkPlanItem(stateId: string, index: number) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    updateState(stateId, { workPlan: state.workPlan.filter((_, i) => i !== index) });
  }

  function addTransition(stateId: string) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    const t: NaviTransition = { condition: "", to: ids[0] ?? stateId, label: "" };
    updateState(stateId, { transitions: [...state.transitions, t] });
  }

  function updateTransition(stateId: string, index: number, patch: Partial<NaviTransition>) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    const next = state.transitions.map((t, i) => (i === index ? { ...t, ...patch } : t));
    updateState(stateId, { transitions: next });
  }

  function removeTransition(stateId: string, index: number) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    updateState(stateId, { transitions: state.transitions.filter((_, i) => i !== index) });
  }

  function toggleTool(stateId: string, tool: NaviStateToolName) {
    const state = states.find((s) => s.id === stateId);
    if (!state) return;
    const current = state.tools ?? [];
    const next = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool];
    updateState(stateId, { tools: next });
  }

  function addTip() {
    const label = "Neuer Hinweis";
    const id = generateUniqueId(label, new Set(tips.map((t) => t.id)));
    setTips((prev) => [...prev, { id, label, instruction: "", coveredWhen: "" }]);
  }

  function updateTip(id: string, patch: Partial<NaviTip>) {
    setTips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTip(id: string) {
    setTips((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSaveStates() {
    setSavingStates(true);
    await onSaveStates(states);
    setSavingStates(false);
  }

  async function handleSaveTips() {
    setSavingTips(true);
    await onSaveTips(tips);
    setSavingTips(false);
  }

  async function handleResetStates() {
    const reset = await onResetStates();
    setStates(reset);
    setExpandedId(null);
  }

  async function handleResetTips() {
    const reset = await onResetTips();
    setTips(reset);
  }

  return (
    <div className="navi-editor">
      <div className="navi-editor-toolbar">
        <span className="navi-editor-title">State Machine bearbeiten</span>
        <button type="button" className="navi-editor-icon-btn" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>

      {error && (
        <div className="navi-editor-error">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      <p className="navi-editor-hint">
        Änderungen gelten app-weit für alle künftigen Navi-Gespräche, sobald gespeichert. Bereits
        erfasste Fakten laufender Gespräche zu geänderten Checklisten-Punkten gelten danach wieder
        als offen.
      </p>

      {/* ── States ────────────────────────────────────────── */}
      <div className="navi-editor-section">
        <div className="navi-editor-section-header">
          <span>Phasen ({states.length})</span>
          <div className="navi-editor-section-actions">
            <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetStates}>
              <RotateCcw size={11} /> Standard
            </button>
            <button type="button" className="navi-editor-btn" onClick={addState}>
              <Plus size={11} /> Phase
            </button>
          </div>
        </div>

        <div className="navi-editor-state-list">
          {states.map((state, index) => {
            const expanded = expandedId === state.id;
            const gated = isGatedNarrow(state);
            return (
              <div key={state.id} className="navi-editor-state">
                <div className="navi-editor-state-header" onClick={() => setExpandedId(expanded ? null : state.id)}>
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="navi-state-id-chip">{state.id}</span>
                  <span className="navi-editor-state-label">{state.label || state.id}</span>
                  <span className={`navi-persona-chip navi-persona-chip--${state.persona}`}>{state.persona}</span>
                  <div className="navi-editor-state-order" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="navi-editor-icon-btn" disabled={index === 0} onClick={() => moveState(index, -1)}>
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="navi-editor-icon-btn"
                      disabled={index === states.length - 1}
                      onClick={() => moveState(index, 1)}
                    >
                      <ChevronDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="navi-editor-icon-btn navi-editor-icon-btn--danger"
                      disabled={state.id === NAVI_INITIAL_STATE_ID}
                      title={state.id === NAVI_INITIAL_STATE_ID ? "Startzustand kann nicht gelöscht werden" : "Phase löschen"}
                      onClick={() => removeState(state.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="navi-editor-state-body">
                    <label className="navi-editor-field">
                      <span>Anzeigename</span>
                      <input
                        type="text"
                        value={state.label ?? ""}
                        onChange={(e) => updateState(state.id, { label: e.target.value })}
                      />
                    </label>

                    <label className="navi-editor-field">
                      <span>Kurzbeschreibung</span>
                      <input
                        type="text"
                        value={state.description ?? ""}
                        onChange={(e) => updateState(state.id, { description: e.target.value })}
                      />
                    </label>

                    <label className="navi-editor-field">
                      <span>Persona</span>
                      <select
                        value={state.persona}
                        onChange={(e) => updateState(state.id, { persona: e.target.value as NaviState["persona"] })}
                      >
                        <option value="narrow">narrow — reiner Fragensteller</option>
                        <option value="full">full — voller Berater</option>
                      </select>
                    </label>

                    <label className="navi-editor-field">
                      <span>Instruction</span>
                      <textarea
                        rows={6}
                        value={state.instruction}
                        onChange={(e) => updateState(state.id, { instruction: e.target.value })}
                      />
                    </label>

                    <label className="navi-editor-checkbox">
                      <input
                        type="checkbox"
                        checked={state.validation?.requiresQuestion ?? false}
                        onChange={(e) => updateState(state.id, { validation: { requiresQuestion: e.target.checked } })}
                      />
                      <span>Antwort muss eine Frage enthalten</span>
                    </label>

                    <div className="navi-editor-subsection">
                      <span className="navi-editor-subsection-label">Tools</span>
                      <div className="navi-editor-tool-options">
                        {TOOL_OPTIONS.map((tool) => (
                          <label key={tool} className="navi-editor-checkbox navi-editor-checkbox--inline">
                            <input
                              type="checkbox"
                              checked={(state.tools ?? []).includes(tool)}
                              onChange={() => toggleTool(state.id, tool)}
                            />
                            <span>{tool}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="navi-editor-subsection">
                      <span className="navi-editor-subsection-label">
                        Checkliste (workPlan) {gated && <em>— erster Übergang ist das Slot-Gate</em>}
                      </span>
                      {state.workPlan.map((item, i) => (
                        <div key={i} className="navi-editor-list-row">
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => updateWorkPlanItem(state.id, i, e.target.value)}
                          />
                          <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removeWorkPlanItem(state.id, i)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={() => addWorkPlanItem(state.id)}>
                        <Plus size={11} /> Punkt
                      </button>
                    </div>

                    <div className="navi-editor-subsection">
                      <span className="navi-editor-subsection-label">Übergänge</span>
                      {state.transitions.map((t, i) => (
                        <div key={i} className="navi-editor-transition">
                          {i === 0 && gated && (
                            <div className="navi-editor-transition-gate-badge">automatischer Übergang (Slot-Gate)</div>
                          )}
                          <div className="navi-editor-list-row">
                            <select value={t.to} onChange={(e) => updateTransition(state.id, i, { to: e.target.value })}>
                              {ids.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                            <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removeTransition(state.id, i)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <input
                            type="text"
                            className="navi-editor-transition-label"
                            placeholder="Kurzbeschriftung (UI)"
                            value={t.label ?? ""}
                            onChange={(e) => updateTransition(state.id, i, { label: e.target.value })}
                          />
                          <textarea
                            rows={2}
                            placeholder="Bedingung (für den Klassifikator)"
                            value={t.condition}
                            onChange={(e) => updateTransition(state.id, i, { condition: e.target.value })}
                          />
                        </div>
                      ))}
                      <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={() => addTransition(state.id)}>
                        <Plus size={11} /> Übergang
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className="navi-editor-btn navi-editor-btn--primary" disabled={savingStates} onClick={handleSaveStates}>
          <Save size={12} /> Phasen speichern
        </button>
      </div>

      {/* ── Tips ──────────────────────────────────────────── */}
      <div className="navi-editor-section">
        <div className="navi-editor-section-header">
          <span>Hinweise ({tips.length})</span>
          <div className="navi-editor-section-actions">
            <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetTips}>
              <RotateCcw size={11} /> Standard
            </button>
            <button type="button" className="navi-editor-btn" onClick={addTip}>
              <Plus size={11} /> Hinweis
            </button>
          </div>
        </div>

        {tips.map((tip) => (
          <div key={tip.id} className="navi-editor-tip">
            <div className="navi-editor-list-row">
              <input type="text" value={tip.label} onChange={(e) => updateTip(tip.id, { label: e.target.value })} />
              <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removeTip(tip.id)}>
                <Trash2 size={12} />
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Anweisung (wann/wie einbringen)"
              value={tip.instruction}
              onChange={(e) => updateTip(tip.id, { instruction: e.target.value })}
            />
            <textarea
              rows={2}
              placeholder="Wann gilt der Hinweis als angesprochen?"
              value={tip.coveredWhen}
              onChange={(e) => updateTip(tip.id, { coveredWhen: e.target.value })}
            />
          </div>
        ))}

        <button type="button" className="navi-editor-btn navi-editor-btn--primary" disabled={savingTips} onClick={handleSaveTips}>
          <Save size={12} /> Hinweise speichern
        </button>
      </div>
    </div>
  );
}
