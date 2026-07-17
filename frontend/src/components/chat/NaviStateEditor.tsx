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
import type { NaviPersonaConfig } from "../../naviPersona.ts";
import type { NaviUseCase } from "../../naviUseCases.ts";
import type { NaviTool } from "../../naviTools.ts";
import type { NaviImprovementLlmPublic, NaviImprovementLlmInput } from "../../naviImprovement.ts";
import "./NaviStateEditor.css";

const TOOL_OPTIONS: NaviStateToolName[] = ["ask_question", "ask_clarification", "ask_yes_no"];
type EditorTab = "states" | "persona" | "tips" | "knowledge" | "improvement";
const TABS: { id: EditorTab; label: string }[] = [
  { id: "states", label: "Phasen" },
  { id: "persona", label: "Persona" },
  { id: "tips", label: "Hinweise" },
  { id: "knowledge", label: "Wissensbasis" },
  { id: "improvement", label: "Verbesserungs-LLM" },
];

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
  initialPersona: NaviPersonaConfig;
  initialUseCases: NaviUseCase[];
  initialTools: NaviTool[];
  initialImprovementLlm: NaviImprovementLlmPublic;
  onSaveStates: (states: NaviState[]) => Promise<boolean>;
  onSaveTips: (tips: NaviTip[]) => Promise<boolean>;
  onSavePersona: (persona: NaviPersonaConfig) => Promise<boolean>;
  onSaveUseCases: (useCases: NaviUseCase[]) => Promise<boolean>;
  onSaveTools: (tools: NaviTool[]) => Promise<boolean>;
  onSaveImprovementLlm: (input: NaviImprovementLlmInput) => Promise<boolean>;
  onResetStates: () => Promise<NaviState[]>;
  onResetTips: () => Promise<NaviTip[]>;
  onResetPersona: () => Promise<NaviPersonaConfig>;
  onResetUseCases: () => Promise<NaviUseCase[]>;
  onResetTools: () => Promise<NaviTool[]>;
  onResetImprovementLlm: () => Promise<NaviImprovementLlmPublic>;
  onClose: () => void;
  error: string | null;
  /** Set when the editor was opened with an LLM-generated change proposal, prefilled into the fields below. */
  improvementNotice?: { rationale: string; warnings: string[] } | null;
}

export function NaviStateEditor({
  initialStates,
  initialTips,
  initialPersona,
  initialUseCases,
  initialTools,
  initialImprovementLlm,
  onSaveStates,
  onSaveTips,
  onSavePersona,
  onSaveUseCases,
  onSaveTools,
  onSaveImprovementLlm,
  onResetStates,
  onResetTips,
  onResetPersona,
  onResetUseCases,
  onResetTools,
  onResetImprovementLlm,
  onClose,
  error,
  improvementNotice,
}: Props) {
  const [tab, setTab] = useState<EditorTab>("states");
  const [states, setStates] = useState<NaviState[]>(initialStates);
  const [tips, setTips] = useState<NaviTip[]>(initialTips);
  const [persona, setPersona] = useState<NaviPersonaConfig>(initialPersona);
  const [useCases, setUseCases] = useState<NaviUseCase[]>(initialUseCases);
  const [tools, setTools] = useState<NaviTool[]>(initialTools);
  const [expandedId, setExpandedId] = useState<string | null>(states[0]?.id ?? null);
  const [savingStates, setSavingStates] = useState(false);
  const [savingTips, setSavingTips] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingUseCases, setSavingUseCases] = useState(false);
  const [savingTools, setSavingTools] = useState(false);
  const [improvementApiUrl, setImprovementApiUrl] = useState(initialImprovementLlm.apiUrl);
  const [improvementModel, setImprovementModel] = useState(initialImprovementLlm.model);
  const [improvementApiKeySet, setImprovementApiKeySet] = useState(initialImprovementLlm.apiKeySet);
  const [improvementApiKeyDraft, setImprovementApiKeyDraft] = useState("");
  const [savingImprovementLlm, setSavingImprovementLlm] = useState(false);

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

  function updatePersonaRule(list: "fullPersonaRules" | "narrowPersonaRules", index: number, value: string) {
    setPersona((prev) => {
      const next = [...prev[list]];
      next[index] = value;
      return { ...prev, [list]: next };
    });
  }

  function addPersonaRule(list: "fullPersonaRules" | "narrowPersonaRules") {
    setPersona((prev) => ({ ...prev, [list]: [...prev[list], ""] }));
  }

  function removePersonaRule(list: "fullPersonaRules" | "narrowPersonaRules", index: number) {
    setPersona((prev) => ({ ...prev, [list]: prev[list].filter((_, i) => i !== index) }));
  }

  function addUseCase() {
    setUseCases((prev) => [...prev, { name: "Neuer Use-Case", description: "", categories: [] }]);
  }

  function updateUseCase(index: number, patch: Partial<NaviUseCase>) {
    setUseCases((prev) => prev.map((uc, i) => (i === index ? { ...uc, ...patch } : uc)));
  }

  function removeUseCase(index: number) {
    setUseCases((prev) => prev.filter((_, i) => i !== index));
  }

  function addTool() {
    setTools((prev) => [...prev, { name: "Neues Tool", category: "", beschreibung: "" }]);
  }

  function updateTool(index: number, patch: Partial<NaviTool>) {
    setTools((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTool(index: number) {
    setTools((prev) => prev.filter((_, i) => i !== index));
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

  async function handleSavePersona() {
    setSavingPersona(true);
    await onSavePersona(persona);
    setSavingPersona(false);
  }

  async function handleSaveUseCases() {
    setSavingUseCases(true);
    await onSaveUseCases(useCases);
    setSavingUseCases(false);
  }

  async function handleSaveTools() {
    setSavingTools(true);
    await onSaveTools(tools);
    setSavingTools(false);
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

  async function handleResetPersona() {
    const reset = await onResetPersona();
    setPersona(reset);
  }

  async function handleResetUseCases() {
    const reset = await onResetUseCases();
    setUseCases(reset);
  }

  async function handleResetTools() {
    const reset = await onResetTools();
    setTools(reset);
  }

  async function handleSaveImprovementLlm() {
    setSavingImprovementLlm(true);
    const ok = await onSaveImprovementLlm({
      apiUrl: improvementApiUrl,
      model: improvementModel,
      apiKey: improvementApiKeyDraft.trim() ? improvementApiKeyDraft : undefined,
    });
    if (ok) {
      if (improvementApiKeyDraft.trim()) setImprovementApiKeySet(true);
      setImprovementApiKeyDraft("");
    }
    setSavingImprovementLlm(false);
  }

  async function handleClearImprovementApiKey() {
    setSavingImprovementLlm(true);
    await onSaveImprovementLlm({ apiUrl: improvementApiUrl, model: improvementModel, apiKey: "" });
    setImprovementApiKeySet(false);
    setImprovementApiKeyDraft("");
    setSavingImprovementLlm(false);
  }

  async function handleResetImprovementLlm() {
    const reset = await onResetImprovementLlm();
    setImprovementApiUrl(reset.apiUrl);
    setImprovementModel(reset.model);
    setImprovementApiKeySet(reset.apiKeySet);
    setImprovementApiKeyDraft("");
  }

  return (
    <div className="navi-editor">
      <div className="navi-editor-toolbar">
        <span className="navi-editor-title">Navi bearbeiten</span>
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

      {improvementNotice && (
        <div className="navi-editor-improvement-notice">
          <div className="navi-editor-improvement-notice-title">
            KI-Änderungsvorschlag aus dem letzten Feedback — noch nicht gespeichert
          </div>
          <p className="navi-editor-improvement-notice-rationale">{improvementNotice.rationale}</p>
          {improvementNotice.warnings.length > 0 && (
            <ul className="navi-editor-improvement-notice-warnings">
              {improvementNotice.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="navi-editor-improvement-notice-hint">
            Prüfe die Tabs auf Änderungen und speichere jede Domäne einzeln, um sie zu übernehmen.
          </p>
        </div>
      )}

      <div className="navi-editor-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`navi-editor-tab${tab === t.id ? " navi-editor-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "states" && (
        <>
          <p className="navi-editor-hint">
            Änderungen gelten app-weit für alle künftigen Navi-Gespräche, sobald gespeichert. Bereits
            erfasste Fakten laufender Gespräche zu geänderten Checklisten-Punkten gelten danach wieder
            als offen.
          </p>

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

                        <label className="navi-editor-checkbox">
                          <input
                            type="checkbox"
                            checked={state.showUseCases ?? false}
                            onChange={(e) => updateState(state.id, { showUseCases: e.target.checked })}
                          />
                          <span>Use-Cases einblenden (Wissensbasis-Tab)</span>
                        </label>

                        <label className="navi-editor-checkbox">
                          <input
                            type="checkbox"
                            checked={state.showTools ?? false}
                            onChange={(e) => updateState(state.id, { showTools: e.target.checked })}
                          />
                          <span>Tool-Katalog einblenden (nur zusammen mit Use-Cases sinnvoll)</span>
                        </label>

                        <label className="navi-editor-checkbox">
                          <input
                            type="checkbox"
                            checked={state.appendPendingProblemsAtEnd ?? false}
                            onChange={(e) => updateState(state.id, { appendPendingProblemsAtEnd: e.target.checked })}
                          />
                          <span>Offene Anliegen am Ende dieser Phase anhängen</span>
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
        </>
      )}

      {tab === "persona" && (
        <div className="navi-editor-section">
          <div className="navi-editor-section-header">
            <span>Persona</span>
            <div className="navi-editor-section-actions">
              <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetPersona}>
                <RotateCcw size={11} /> Standard
              </button>
            </div>
          </div>

          <label className="navi-editor-field">
            <span>Rollenbeschreibung (roleIntro, nur Full-Persona-Phasen)</span>
            <textarea
              rows={4}
              value={persona.roleIntro}
              onChange={(e) => setPersona((prev) => ({ ...prev, roleIntro: e.target.value }))}
            />
          </label>

          <div className="navi-editor-subsection">
            <span className="navi-editor-subsection-label">Full-Persona-Regeln (Berater-Phasen)</span>
            {persona.fullPersonaRules.map((rule, i) => (
              <div key={i} className="navi-editor-list-row">
                <textarea rows={2} value={rule} onChange={(e) => updatePersonaRule("fullPersonaRules", i, e.target.value)} />
                <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removePersonaRule("fullPersonaRules", i)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={() => addPersonaRule("fullPersonaRules")}>
              <Plus size={11} /> Regel
            </button>
          </div>

          <div className="navi-editor-subsection">
            <span className="navi-editor-subsection-label">Narrow-Persona-Regeln (Frage-Phasen)</span>
            {persona.narrowPersonaRules.map((rule, i) => (
              <div key={i} className="navi-editor-list-row">
                <textarea rows={2} value={rule} onChange={(e) => updatePersonaRule("narrowPersonaRules", i, e.target.value)} />
                <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removePersonaRule("narrowPersonaRules", i)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={() => addPersonaRule("narrowPersonaRules")}>
              <Plus size={11} /> Regel
            </button>
          </div>

          <button type="button" className="navi-editor-btn navi-editor-btn--primary" disabled={savingPersona} onClick={handleSavePersona}>
            <Save size={12} /> Persona speichern
          </button>
        </div>
      )}

      {tab === "tips" && (
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
      )}

      {tab === "knowledge" && (
        <>
          <div className="navi-editor-section">
            <div className="navi-editor-section-header">
              <span>Use-Cases ({useCases.length})</span>
              <div className="navi-editor-section-actions">
                <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetUseCases}>
                  <RotateCcw size={11} /> Standard
                </button>
                <button type="button" className="navi-editor-btn" onClick={addUseCase}>
                  <Plus size={11} /> Use-Case
                </button>
              </div>
            </div>

            {useCases.map((uc, i) => (
              <div key={i} className="navi-editor-tip">
                <div className="navi-editor-list-row">
                  <input type="text" placeholder="Name" value={uc.name} onChange={(e) => updateUseCase(i, { name: e.target.value })} />
                  <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removeUseCase(i)}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Beschreibung (welche Art Problem passt hierher?)"
                  value={uc.description}
                  onChange={(e) => updateUseCase(i, { description: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Kategorien, kommagetrennt (z.B. seo, social_media)"
                  value={uc.categories.join(", ")}
                  onChange={(e) => updateUseCase(i, { categories: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })}
                />
              </div>
            ))}

            <button type="button" className="navi-editor-btn navi-editor-btn--primary" disabled={savingUseCases} onClick={handleSaveUseCases}>
              <Save size={12} /> Use-Cases speichern
            </button>
          </div>

          <div className="navi-editor-section">
            <div className="navi-editor-section-header">
              <span>Tool-Katalog ({tools.length})</span>
              <div className="navi-editor-section-actions">
                <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetTools}>
                  <RotateCcw size={11} /> Standard
                </button>
                <button type="button" className="navi-editor-btn" onClick={addTool}>
                  <Plus size={11} /> Tool
                </button>
              </div>
            </div>

            {tools.map((tool, i) => (
              <div key={i} className="navi-editor-tip">
                <div className="navi-editor-list-row">
                  <input type="text" placeholder="Name" value={tool.name} onChange={(e) => updateTool(i, { name: e.target.value })} />
                  <input type="text" placeholder="Kategorie" value={tool.category} onChange={(e) => updateTool(i, { category: e.target.value })} />
                  <button type="button" className="navi-editor-icon-btn navi-editor-icon-btn--danger" onClick={() => removeTool(i)}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Beschreibung"
                  value={tool.beschreibung}
                  onChange={(e) => updateTool(i, { beschreibung: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Slug (optional, sonst aus Name abgeleitet)"
                  value={tool.slug ?? ""}
                  onChange={(e) => updateTool(i, { slug: e.target.value || undefined })}
                />
              </div>
            ))}

            <button type="button" className="navi-editor-btn navi-editor-btn--primary" disabled={savingTools} onClick={handleSaveTools}>
              <Save size={12} /> Tools speichern
            </button>
          </div>
        </>
      )}

      {tab === "improvement" && (
        <div className="navi-editor-section">
          <div className="navi-editor-section-header">
            <span>Verbesserungs-LLM</span>
            <div className="navi-editor-section-actions">
              <button type="button" className="navi-editor-btn navi-editor-btn--ghost" onClick={handleResetImprovementLlm}>
                <RotateCcw size={11} /> Standard
              </button>
            </div>
          </div>

          <p className="navi-editor-hint">
            Wird ausschließlich für „Aus Feedback verbessern" verwendet — unabhängig davon, welches
            Modell der Händler-Chat gerade nutzt. Leer lassen, um stattdessen das aktuell im Chat
            ausgewählte Modell zu verwenden.
          </p>

          <label className="navi-editor-field">
            <span>API-URL</span>
            <input
              type="text"
              placeholder="z.B. https://api.openai.com/v1"
              value={improvementApiUrl}
              onChange={(e) => setImprovementApiUrl(e.target.value)}
            />
          </label>

          <label className="navi-editor-field">
            <span>Modell</span>
            <input
              type="text"
              placeholder="z.B. gpt-5"
              value={improvementModel}
              onChange={(e) => setImprovementModel(e.target.value)}
            />
          </label>

          <label className="navi-editor-field">
            <span>API-Key {improvementApiKeySet ? "(gesetzt — zum Ändern neu eingeben)" : ""}</span>
            <input
              type="password"
              placeholder={improvementApiKeySet ? "•••••••• (unverändert lassen, um beizubehalten)" : "API-Key"}
              value={improvementApiKeyDraft}
              onChange={(e) => setImprovementApiKeyDraft(e.target.value)}
            />
          </label>

          {improvementApiKeySet && (
            <button
              type="button"
              className="navi-editor-btn navi-editor-btn--ghost"
              disabled={savingImprovementLlm}
              onClick={handleClearImprovementApiKey}
            >
              <Trash2 size={11} /> API-Key entfernen
            </button>
          )}

          <button
            type="button"
            className="navi-editor-btn navi-editor-btn--primary"
            disabled={savingImprovementLlm}
            onClick={handleSaveImprovementLlm}
          >
            <Save size={12} /> Verbesserungs-LLM speichern
          </button>
        </div>
      )}
    </div>
  );
}
