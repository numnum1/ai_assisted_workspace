import { useState, useEffect, useCallback } from 'react';
import { Settings, X, Loader, Plus, Trash2, Save, Check, ChevronLeft } from 'lucide-react';
import { projectConfigApi } from '../api.ts';
import type { ProjectConfig, Mode } from '../types.ts';

interface ProjectSettingsModalProps {
  onClose: () => void;
  onModesChanged: () => void;
  onGeneralConfigSaved?: () => void;
}

type Tab = 'general' | 'modes' | 'rules';

interface ModeForm {
  id: string;
  name: string;
  color: string;
  systemPrompt: string;
  autoIncludes: string;
  rules: string;
}

interface RuleEditor {
  name: string;
  content: string;
  isNew: boolean;
}

function TagListEditor({
  items,
  onAdd,
  onRemove,
  placeholder,
  disabled,
}: {
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const commit = () => {
    const v = input.trim();
    if (v) { onAdd(v); setInput(''); }
  };
  return (
    <div className="ps-tag-list">
      <div className="ps-tag-chips">
        {items.map((item, i) => (
          <span key={i} className="ps-tag-chip">
            <span className="ps-tag-chip-text">{item}</span>
            {!disabled && (
              <button className="ps-tag-chip-remove" onClick={() => onRemove(i)} title="Remove">
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="ps-tag-empty">None</span>}
      </div>
      {!disabled && (
        <div className="ps-tag-input-row">
          <input
            className="ps-input ps-tag-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
            placeholder={placeholder}
          />
          <button className="ps-tag-add-btn" onClick={commit} disabled={!input.trim()} title="Add">
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectSettingsModal({ onClose, onModesChanged, onGeneralConfigSaved }: ProjectSettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General
  const [config, setConfig] = useState<ProjectConfig>({
    name: '',
    description: '',
    alwaysInclude: [],
    globalRules: [],
    defaultMode: '',
    workspaceMode: 'default',
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Modes
  const [modes, setModes] = useState<Mode[]>([]);
  const [modeForm, setModeForm] = useState<ModeForm | null>(null);
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [deletingMode, setDeletingMode] = useState<string | null>(null);

  // Rules
  const [rules, setRules] = useState<string[]>([]);
  const [ruleEditor, setRuleEditor] = useState<RuleEditor | null>(null);
  const [loadingRule, setLoadingRule] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRule, setDeletingRule] = useState<string | null>(null);
  const [ruleSaved, setRuleSaved] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await projectConfigApi.status();
      setInitialized(status.initialized);
      if (status.initialized) {
        const [cfg, mds, ruleList] = await Promise.all([
          projectConfigApi.get(),
          projectConfigApi.getModes(),
          projectConfigApi.getRules(),
        ]);
        setConfig(cfg);
        setModes(mds);
        setRules(ruleList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleInit = async () => {
    setInitializing(true);
    setError(null);
    try {
      const cfg = await projectConfigApi.init();
      setConfig(cfg);
      setInitialized(true);
      const [mds, ruleList] = await Promise.all([
        projectConfigApi.getModes(),
        projectConfigApi.getRules(),
      ]);
      setModes(mds);
      setRules(ruleList);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setInitializing(false);
    }
  };

  // ── General ──────────────────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError(null);
    try {
      await projectConfigApi.update({ ...config, workspaceMode: 'default' });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
      onGeneralConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Modes ─────────────────────────────────────────────────────────────────────

  const openNewMode = () => {
    setEditingModeId(null);
    setModeForm({ id: '', name: '', color: '#89b4fa', systemPrompt: '', autoIncludes: '', rules: '' });
  };

  const openEditMode = (mode: Mode) => {
    setEditingModeId(mode.id);
    setModeForm({
      id: mode.id,
      name: mode.name,
      color: mode.color || '#89b4fa',
      systemPrompt: mode.systemPrompt || '',
      autoIncludes: (mode.autoIncludes || []).join('\n'),
      rules: (mode.rules || []).join('\n'),
    });
  };

  const handleSaveMode = async () => {
    if (!modeForm || !modeForm.id.trim() || !modeForm.name.trim()) return;
    setSavingMode(true);
    setError(null);
    try {
      const mode: Mode = {
        id: modeForm.id.trim().replace(/\s+/g, '-').toLowerCase(),
        name: modeForm.name.trim(),
        color: modeForm.color,
        systemPrompt: modeForm.systemPrompt,
        autoIncludes: modeForm.autoIncludes.split('\n').map(s => s.trim()).filter(Boolean),
        rules: modeForm.rules.split('\n').map(s => s.trim()).filter(Boolean),
      };
      await projectConfigApi.saveMode(mode.id, mode);
      const updated = await projectConfigApi.getModes();
      setModes(updated);
      setModeForm(null);
      setEditingModeId(null);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mode');
    } finally {
      setSavingMode(false);
    }
  };

  const handleDeleteMode = async (id: string) => {
    setDeletingMode(id);
    setError(null);
    try {
      await projectConfigApi.deleteMode(id);
      setModes(prev => prev.filter(m => m.id !== id));
      if (editingModeId === id) { setModeForm(null); setEditingModeId(null); }
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mode');
    } finally {
      setDeletingMode(null);
    }
  };

  // ── Rules ─────────────────────────────────────────────────────────────────────

  const openNewRule = () => {
    setRuleEditor({ name: '', content: '', isNew: true });
  };

  const openEditRule = async (rulePath: string) => {
    const name = rulePath.replace(/^rules\//, '').replace(/\.md$/, '');
    setLoadingRule(true);
    setError(null);
    try {
      const data = await projectConfigApi.getRuleContent(name);
      setRuleEditor({ name: data.name, content: data.content, isNew: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rule');
    } finally {
      setLoadingRule(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleEditor || !ruleEditor.name.trim()) return;
    setSavingRule(true);
    setError(null);
    try {
      await projectConfigApi.saveRule(ruleEditor.name.trim(), ruleEditor.content);
      const updated = await projectConfigApi.getRules();
      setRules(updated);
      setRuleEditor(prev => prev ? { ...prev, isNew: false } : null);
      setRuleSaved(true);
      setTimeout(() => setRuleSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (rulePath: string) => {
    const name = rulePath.replace(/^rules\//, '').replace(/\.md$/, '');
    setDeletingRule(rulePath);
    setError(null);
    try {
      await projectConfigApi.deleteRule(name);
      setRules(prev => prev.filter(r => r !== rulePath));
      if (ruleEditor && ruleEditor.name === name) setRuleEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setDeletingRule(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-header">
          <Settings size={15} className="ps-header-icon" />
          <span className="ps-header-title">Project Settings</span>
          <button className="ps-close-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="ps-loading">
            <Loader size={18} className="ps-spinner" />
            <span>Loading...</span>
          </div>
        ) : !initialized ? (
          <div className="ps-uninit">
            <p className="ps-uninit-text">
              This project has no <code>.assistant/</code> configuration yet.
              Initialize it to create project-specific modes, rules, and settings
              that will be committed with your project via Git.
            </p>
            {error && <div className="ps-error">{error}</div>}
            <button className="ps-init-btn" onClick={handleInit} disabled={initializing}>
              {initializing
                ? <><Loader size={13} className="ps-spinner" /> Initializing...</>
                : <><Plus size={13} /> Initialize .assistant/</>
              }
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="ps-tabs">
              {(['general', 'modes', 'rules'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`ps-tab ${tab === t ? 'active' : ''}`}
                  onClick={() => { setTab(t); setError(null); }}
                >
                  {t === 'general' ? 'General' : t === 'modes' ? `Modes (${modes.length})` : `Rules (${rules.length})`}
                </button>
              ))}
            </div>

            {error && <div className="ps-error">{error}</div>}

            {/* General tab */}
            {tab === 'general' && (
              <div className="ps-tab-content">
                <label className="ps-label">Project Name</label>
                <input
                  className="ps-input"
                  value={config.name}
                  onChange={e => setConfig(p => ({ ...p, name: e.target.value }))}
                  placeholder="My Project"
                />

                <label className="ps-label">Description</label>
                <input
                  className="ps-input"
                  value={config.description}
                  onChange={e => setConfig(p => ({ ...p, description: e.target.value }))}
                  placeholder="Short description of the project"
                />

                <label className="ps-label">Default mode</label>
                <p className="ps-hint">Selected automatically when you open the app (by mode id).</p>
                <select
                  className="ps-input"
                  value={config.defaultMode ?? ''}
                  onChange={e => setConfig(p => ({ ...p, defaultMode: e.target.value }))}
                >
                  <option value="">Automatic (review, or first mode if review is missing)</option>
                  {modes.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                  ))}
                </select>

                <p className="ps-hint">
                  Der Datei-Browser nutzt immer den Standard-Modus. Medien-Projekte (Buch, Musik, …) legst du per Rechtsklick auf einen Ordner im Dateibaum an.
                </p>

                <label className="ps-label">Always Include Files</label>
                <p className="ps-hint">These files are always added to the AI context, regardless of mode.</p>
                <TagListEditor
                  items={config.alwaysInclude}
                  onAdd={v => setConfig(p => ({ ...p, alwaysInclude: [...p.alwaysInclude, v] }))}
                  onRemove={i => setConfig(p => ({ ...p, alwaysInclude: p.alwaysInclude.filter((_, idx) => idx !== i) }))}
                  placeholder="e.g. story.md or characters/main-cast.md"
                />

                <label className="ps-label">Global Rules</label>
                <p className="ps-hint">Rule files (from the Rules tab) injected into every mode's system prompt.</p>
                <TagListEditor
                  items={config.globalRules}
                  onAdd={v => setConfig(p => ({ ...p, globalRules: [...p.globalRules, v] }))}
                  onRemove={i => setConfig(p => ({ ...p, globalRules: p.globalRules.filter((_, idx) => idx !== i) }))}
                  placeholder="e.g. rules/style-guide.md"
                />

                <div className="ps-actions">
                  <button className="ps-save-btn" onClick={handleSaveConfig} disabled={savingConfig}>
                    {savingConfig
                      ? <><Loader size={13} className="ps-spinner" /> Saving...</>
                      : configSaved
                        ? <><Check size={13} /> Saved</>
                        : <><Save size={13} /> Save</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Modes tab */}
            {tab === 'modes' && (
              <div className="ps-tab-content">
                {modeForm ? (
                  <div className="ps-mode-form">
                    <div className="ps-form-nav">
                      <button className="ps-back-btn" onClick={() => { setModeForm(null); setEditingModeId(null); }}>
                        <ChevronLeft size={14} />
                        Back
                      </button>
                      <span className="ps-form-title">{editingModeId ? 'Edit Mode' : 'New Mode'}</span>
                    </div>

                    <label className="ps-label">ID <span className="ps-label-hint">(filename, no spaces)</span></label>
                    <input
                      className="ps-input"
                      value={modeForm.id}
                      onChange={e => setModeForm(p => p && ({ ...p, id: e.target.value }))}
                      placeholder="e.g. game-design"
                      disabled={editingModeId !== null}
                    />

                    <label className="ps-label">Name</label>
                    <input
                      className="ps-input"
                      value={modeForm.name}
                      onChange={e => setModeForm(p => p && ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Game Design"
                    />

                    <label className="ps-label">Color</label>
                    <div className="ps-color-row">
                      <input
                        type="color"
                        className="ps-color-picker"
                        value={modeForm.color}
                        onChange={e => setModeForm(p => p && ({ ...p, color: e.target.value }))}
                      />
                      <input
                        className="ps-input ps-color-input"
                        value={modeForm.color}
                        onChange={e => setModeForm(p => p && ({ ...p, color: e.target.value }))}
                        placeholder="#89b4fa"
                      />
                    </div>

                    <label className="ps-label">System Prompt</label>
                    <textarea
                      className="ps-textarea ps-textarea-tall"
                      value={modeForm.systemPrompt}
                      onChange={e => setModeForm(p => p && ({ ...p, systemPrompt: e.target.value }))}
                      placeholder="You are a helpful assistant..."
                      rows={6}
                    />

                    <label className="ps-label">Auto-Include Files <span className="ps-label-hint">(one per line)</span></label>
                    <textarea
                      className="ps-textarea"
                      value={modeForm.autoIncludes}
                      onChange={e => setModeForm(p => p && ({ ...p, autoIncludes: e.target.value }))}
                      placeholder="story.md&#10;characters/main-cast.md"
                      rows={3}
                    />

                    <label className="ps-label">Rules <span className="ps-label-hint">(one path per line)</span></label>
                    <textarea
                      className="ps-textarea"
                      value={modeForm.rules}
                      onChange={e => setModeForm(p => p && ({ ...p, rules: e.target.value }))}
                      placeholder="rules/review-checklist.md"
                      rows={2}
                    />

                    <div className="ps-actions">
                      <button
                        className="ps-save-btn"
                        onClick={handleSaveMode}
                        disabled={savingMode || !modeForm.id.trim() || !modeForm.name.trim()}
                      >
                        {savingMode
                          ? <><Loader size={13} className="ps-spinner" /> Saving...</>
                          : <><Save size={13} /> Save Mode</>
                        }
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ps-list">
                      {modes.length === 0 && (
                        <div className="ps-empty">No modes defined.</div>
                      )}
                      {modes.map(mode => (
                        <div key={mode.id} className="ps-list-item" onClick={() => openEditMode(mode)}>
                          <span
                            className="ps-mode-dot"
                            style={{ background: mode.color || '#89b4fa' }}
                          />
                          <span className="ps-list-item-name">{mode.name}</span>
                          <span className="ps-list-item-id">{mode.id}</span>
                          <button
                            className="ps-list-item-delete"
                            title="Delete mode"
                            onClick={e => { e.stopPropagation(); handleDeleteMode(mode.id); }}
                            disabled={deletingMode === mode.id}
                          >
                            {deletingMode === mode.id
                              ? <Loader size={12} className="ps-spinner" />
                              : <Trash2 size={12} />
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="ps-actions">
                      <button className="ps-add-btn" onClick={openNewMode}>
                        <Plus size={13} /> New Mode
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Rules tab */}
            {tab === 'rules' && (
              <div className="ps-tab-content">
                {ruleEditor ? (
                  <div className="ps-rule-form">
                    <div className="ps-form-nav">
                      <button className="ps-back-btn" onClick={() => setRuleEditor(null)}>
                        <ChevronLeft size={14} />
                        Back
                      </button>
                      <span className="ps-form-title">{ruleEditor.isNew ? 'New Rule' : `Edit: ${ruleEditor.name}`}</span>
                    </div>

                    {ruleEditor.isNew && (
                      <>
                        <label className="ps-label">Rule Name <span className="ps-label-hint">(.md will be added automatically)</span></label>
                        <input
                          className="ps-input"
                          value={ruleEditor.name}
                          onChange={e => setRuleEditor(p => p && ({ ...p, name: e.target.value }))}
                          placeholder="e.g. style-guide"
                          autoFocus
                        />
                      </>
                    )}

                    <label className="ps-label">Content <span className="ps-label-hint">(Markdown)</span></label>
                    <textarea
                      className="ps-textarea ps-textarea-rule"
                      value={ruleEditor.content}
                      onChange={e => setRuleEditor(p => p && ({ ...p, content: e.target.value }))}
                      placeholder="Write your rule content here..."
                      rows={12}
                    />

                    <div className="ps-actions">
                      <button
                        className="ps-save-btn"
                        onClick={handleSaveRule}
                        disabled={savingRule || !ruleEditor.name.trim()}
                      >
                        {savingRule
                          ? <><Loader size={13} className="ps-spinner" /> Saving...</>
                          : ruleSaved
                            ? <><Check size={13} /> Saved</>
                            : <><Save size={13} /> Save Rule</>
                        }
                      </button>
                    </div>
                  </div>
                ) : loadingRule ? (
                  <div className="ps-loading">
                    <Loader size={16} className="ps-spinner" />
                    <span>Loading rule...</span>
                  </div>
                ) : (
                  <>
                    <div className="ps-list">
                      {rules.length === 0 && (
                        <div className="ps-empty">No rules defined.</div>
                      )}
                      {rules.map(rulePath => {
                        const label = rulePath.replace(/^rules\//, '').replace(/\.md$/, '');
                        return (
                          <div key={rulePath} className="ps-list-item" onClick={() => openEditRule(rulePath)}>
                            <span className="ps-list-item-name">{label}</span>
                            <span className="ps-list-item-id">{rulePath}</span>
                            <button
                              className="ps-list-item-delete"
                              title="Delete rule"
                              onClick={e => { e.stopPropagation(); handleDeleteRule(rulePath); }}
                              disabled={deletingRule === rulePath}
                            >
                              {deletingRule === rulePath
                                ? <Loader size={12} className="ps-spinner" />
                                : <Trash2 size={12} />
                              }
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="ps-actions">
                      <button className="ps-add-btn" onClick={openNewRule}>
                        <Plus size={13} /> New Rule
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
