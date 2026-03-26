import { useState, useEffect, useCallback } from 'react';
import { Settings, X, Loader, Plus, Trash2, Save, Check, ChevronLeft, FolderOpen, RefreshCw, Copy } from 'lucide-react';
import { projectConfigApi, llmApi } from '../api.ts';
import type { ProjectConfig, Mode, WorkspaceModeInfo, LlmPublic } from '../types.ts';

interface ProjectSettingsModalProps {
  onClose: () => void;
  onModesChanged: () => void;
  onGeneralConfigSaved?: () => void;
  /** Bumps workspace mode cache in the app (file tree labels, subproject dialog) after plugin list refresh */
  onWorkspacePluginsChanged?: () => void;
}

type Tab = 'general' | 'modes' | 'workspacePlugins' | 'rules' | 'aiProviders';

interface LlmFormState {
  editingId: string | null;
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKey: string;
  reasoningApiUrl: string;
  reasoningModel: string;
  reasoningApiKey: string;
}

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

export function ProjectSettingsModal({
  onClose,
  onModesChanged,
  onGeneralConfigSaved,
  onWorkspacePluginsChanged,
}: ProjectSettingsModalProps) {
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

  // Workspace mode plugins (YAML under app data)
  const [workspaceModesList, setWorkspaceModesList] = useState<WorkspaceModeInfo[]>([]);
  const [workspaceModesDir, setWorkspaceModesDir] = useState<{ path: string; exists: boolean } | null>(null);
  const [loadingWorkspacePlugins, setLoadingWorkspacePlugins] = useState(false);
  const [revealingWorkspaceDir, setRevealingWorkspaceDir] = useState(false);

  // LLMs (AppData ai-providers.json)
  const [llmsState, setLlmsState] = useState<{
    activeId: string | null;
    providers: LlmPublic[];
  } | null>(null);
  const [loadingLlms, setLoadingLlms] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [deletingLlmId, setDeletingLlmId] = useState<string | null>(null);
  const [activatingLlmId, setActivatingLlmId] = useState<string | null>(null);
  const [llmForm, setLlmForm] = useState<LlmFormState | null>(null);

  const loadLlms = useCallback(async () => {
    setLoadingLlms(true);
    setError(null);
    try {
      const data = await llmApi.list();
      setLlmsState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LLMs');
    } finally {
      setLoadingLlms(false);
    }
  }, []);

  const loadWorkspacePlugins = useCallback(
    async (syncApp: boolean) => {
      setLoadingWorkspacePlugins(true);
      setError(null);
      try {
        const [dir, list] = await Promise.all([
          projectConfigApi.getWorkspaceModesDataDir(),
          projectConfigApi.listWorkspaceModes(),
        ]);
        setWorkspaceModesDir(dir);
        setWorkspaceModesList(list);
        if (syncApp) onWorkspacePluginsChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Workspace-Plugins konnten nicht geladen werden');
      } finally {
        setLoadingWorkspacePlugins(false);
      }
    },
    [onWorkspacePluginsChanged],
  );

  useEffect(() => {
    if (initialized && tab === 'workspacePlugins') {
      void loadWorkspacePlugins(false);
    }
  }, [initialized, tab, loadWorkspacePlugins]);

  useEffect(() => {
    if (!loading && tab === 'aiProviders') {
      void loadLlms();
    }
  }, [loading, tab, loadLlms]);

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

  const emptyLlmForm = (): LlmFormState => ({
    editingId: null,
    name: '',
    fastApiUrl: '',
    fastModel: '',
    fastApiKey: '',
    reasoningApiUrl: '',
    reasoningModel: '',
    reasoningApiKey: '',
  });

  const openNewLlm = () => setLlmForm(emptyLlmForm());

  const openEditLlm = (p: LlmPublic) => {
    setLlmForm({
      editingId: p.id,
      name: p.name,
      fastApiUrl: p.fastApiUrl ?? '',
      fastModel: p.fastModel ?? '',
      fastApiKey: '',
      reasoningApiUrl: p.reasoningApiUrl ?? '',
      reasoningModel: p.reasoningModel ?? '',
      reasoningApiKey: '',
    });
  };

  const handleSaveLlm = async () => {
    if (!llmForm) return;
    const { editingId, name, fastApiUrl, fastModel, fastApiKey,
            reasoningApiUrl, reasoningModel, reasoningApiKey } = llmForm;
    if (!name.trim() || !fastApiUrl.trim() || !fastModel.trim()) return;
    if (!editingId && !fastApiKey.trim()) {
      setError('Fast-API-Key ist für einen neuen Eintrag erforderlich');
      return;
    }
    setSavingLlm(true);
    setError(null);
    try {
      if (editingId) {
        await llmApi.update(editingId, {
          name: name.trim(),
          fastApiUrl: fastApiUrl.trim(),
          fastModel: fastModel.trim(),
          ...(fastApiKey.trim() ? { fastApiKey: fastApiKey.trim() } : {}),
          reasoningApiUrl: reasoningApiUrl.trim(),
          reasoningModel: reasoningModel.trim(),
          ...(reasoningApiKey.trim() ? { reasoningApiKey: reasoningApiKey.trim() } : {}),
        });
      } else {
        await llmApi.create({
          name: name.trim(),
          fastApiUrl: fastApiUrl.trim(),
          fastModel: fastModel.trim(),
          fastApiKey: fastApiKey.trim(),
          reasoningApiUrl: reasoningApiUrl.trim(),
          reasoningModel: reasoningModel.trim(),
          ...(reasoningApiKey.trim() ? { reasoningApiKey: reasoningApiKey.trim() } : {}),
        });
      }
      setLlmForm(null);
      await loadLlms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save LLM');
    } finally {
      setSavingLlm(false);
    }
  };

  const handleDeleteLlm = async (id: string) => {
    setDeletingLlmId(id);
    setError(null);
    try {
      await llmApi.remove(id);
      if (llmForm?.editingId === id) setLlmForm(null);
      await loadLlms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete LLM');
    } finally {
      setDeletingLlmId(null);
    }
  };

  const handleActivateLlm = async (id: string) => {
    setActivatingLlmId(id);
    setError(null);
    try {
      await llmApi.activate(id);
      await loadLlms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate LLM');
    } finally {
      setActivatingLlmId(null);
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
        ) : (
          <>
            <div className="ps-tabs">
              {(['general', 'modes', 'workspacePlugins', 'aiProviders', 'rules'] as Tab[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`ps-tab ${tab === t ? 'active' : ''}`}
                  disabled={!initialized && t !== 'aiProviders'}
                  onClick={() => {
                    if (!initialized && t !== 'aiProviders') return;
                    setTab(t);
                    setError(null);
                  }}
                >
                  {t === 'general'
                    ? 'General'
                    : t === 'modes'
                      ? `Modes (${modes.length})`
                      : t === 'workspacePlugins'
                        ? 'Workspace plugins'
                        : t === 'aiProviders'
                          ? `LLMs (${llmsState?.providers?.length ?? 0})`
                          : `Rules (${rules.length})`}
                </button>
              ))}
            </div>

            {error && <div className="ps-error">{error}</div>}

            {!initialized && tab !== 'aiProviders' && (
              <div className="ps-uninit">
                <p className="ps-uninit-text">
                  This project has no <code>.assistant/</code> configuration yet.
                  Initialize it to create project-specific modes, rules, and settings
                  that will be committed with your project via Git.
                </p>
                <p className="ps-hint" style={{ marginTop: '0.75rem' }}>
                  You can still configure <strong>AI providers</strong> (AppData) via the tab above — they apply globally.
                </p>
                <button className="ps-init-btn" onClick={handleInit} disabled={initializing}>
                  {initializing
                    ? <><Loader size={13} className="ps-spinner" /> Initializing...</>
                    : <><Plus size={13} /> Initialize .assistant/</>
                  }
                </button>
              </div>
            )}

            {/* General tab */}
            {initialized && tab === 'general' && (
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
                  Der Datei-Browser nutzt immer den Standard-Modus. Medien-Projekte (Buch, Musik, …) legst du per Rechtsklick auf einen Ordner an. Eigene Typen als YAML-Plugins findest du unter <strong>Workspace plugins</strong>.
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
            {initialized && tab === 'modes' && (
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
                      placeholder="e.g. technical-review"
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

            {/* Workspace plugins (user YAML under app data) */}
            {initialized && tab === 'workspacePlugins' && (
              <div className="ps-tab-content ps-wp-tab">
                <p className="ps-hint">
                  Lege hier eigene Medien-Projekt-Typen ab: eine YAML-Datei pro Modus (Dateiname = id, z. B.{' '}
                  <code>my-mode.yaml</code>). Mit <code>mediaType: true</code> erscheint der Typ im Kontextmenü
                  „Als Medien-Projekt einrichten“. Nach Änderungen auf der Festplatte unten auf „App neu laden“ klicken.
                </p>

                <label className="ps-label">Plugin-Ordner</label>
                <div className="ps-wp-path-row">
                  <code className="ps-wp-path" title={workspaceModesDir?.path}>
                    {workspaceModesDir?.path ?? '—'}
                  </code>
                  <div className="ps-wp-path-actions">
                    <button
                      type="button"
                      className="ps-secondary-btn"
                      disabled={!workspaceModesDir?.path}
                      title="Pfad kopieren"
                      onClick={() => {
                        if (workspaceModesDir?.path) {
                          void navigator.clipboard.writeText(workspaceModesDir.path);
                        }
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="ps-secondary-btn"
                      disabled={revealingWorkspaceDir}
                      title="Ordner im Explorer öffnen (wird bei Bedarf angelegt)"
                      onClick={() => {
                        setRevealingWorkspaceDir(true);
                        setError(null);
                        projectConfigApi
                          .revealWorkspaceModesDataDir()
                          .then(() => loadWorkspacePlugins(false))
                          .catch((err: unknown) =>
                            setError(err instanceof Error ? err.message : 'Ordner konnte nicht geöffnet werden'),
                          )
                          .finally(() => setRevealingWorkspaceDir(false));
                      }}
                    >
                      {revealingWorkspaceDir ? (
                        <Loader size={14} className="ps-spinner" />
                      ) : (
                        <FolderOpen size={14} />
                      )}
                      <span>Ordner öffnen</span>
                    </button>
                    <button
                      type="button"
                      className="ps-save-btn ps-wp-refresh-btn"
                      disabled={loadingWorkspacePlugins}
                      title="Liste neu laden und Ansicht im Dateibaum aktualisieren"
                      onClick={() => void loadWorkspacePlugins(true)}
                    >
                      {loadingWorkspacePlugins ? (
                        <Loader size={13} className="ps-spinner" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      App neu laden
                    </button>
                  </div>
                </div>
                {!workspaceModesDir?.exists && workspaceModesDir?.path && (
                  <p className="ps-hint ps-wp-missing">Der Ordner existiert noch nicht — „Ordner öffnen“ legt ihn an.</p>
                )}

                <label className="ps-label">Erkannte Workspace-Modi</label>
                <p className="ps-hint">Eingebaut (classpath) und Benutzer (AppData). Überschreibt ein User-YAML dieselbe id, zählt die Quelle als „user“.</p>
                <div className="ps-wp-table-wrap">
                  <table className="ps-wp-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>id</th>
                        <th>Quelle</th>
                        <th>Medien-Typ</th>
                        <th>Icon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspaceModesList.length === 0 && !loadingWorkspacePlugins && (
                        <tr>
                          <td colSpan={5} className="ps-wp-empty">
                            Keine Modi geladen.
                          </td>
                        </tr>
                      )}
                      {workspaceModesList.map((m) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td>
                            <code>{m.id}</code>
                          </td>
                          <td>{m.source === 'user' ? 'user (AppData)' : 'builtin'}</td>
                          <td>{m.mediaType ? 'ja' : 'nein'}</td>
                          <td>
                            <code>{m.icon}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LLMs (AppData ai-providers.json) */}
            {tab === 'aiProviders' && (
              <div className="ps-tab-content">
                <p className="ps-hint">
                  Jeder Eintrag hat eine <strong>Fast</strong>- und optional eine <strong>⚡ Reasoning</strong>-Konfiguration —
                  jeweils mit eigenem API-URL, Key und Modell (z. B. unterschiedliche Anbieter).
                  Der aktive Eintrag wird für alle Chats genutzt; der ⚡-Toggle im Chatfenster wählt die Variante.
                  Bei leerer Liste nutzt der Server die Defaults aus <code>application.yml</code> / env.
                </p>
                {llmForm ? (
                  <div className="ps-mode-form">
                    <div className="ps-form-nav">
                      <button type="button" className="ps-back-btn" onClick={() => setLlmForm(null)}>
                        <ChevronLeft size={14} />
                        Back
                      </button>
                      <span className="ps-form-title">
                        {llmForm.editingId ? 'LLM bearbeiten' : 'Neues LLM'}
                      </span>
                    </div>

                    <label className="ps-label">Name</label>
                    <input
                      className="ps-input"
                      value={llmForm.name}
                      onChange={e => setLlmForm(p => p && ({ ...p, name: e.target.value }))}
                      placeholder="z. B. eecc.ai"
                    />

                    <p className="ps-label ps-llm-section-header">Fast-Konfiguration</p>

                    <label className="ps-label">API base URL</label>
                    <input
                      className="ps-input"
                      value={llmForm.fastApiUrl}
                      onChange={e => setLlmForm(p => p && ({ ...p, fastApiUrl: e.target.value }))}
                      placeholder="https://api.eecc.ai"
                    />
                    <label className="ps-label">Modell</label>
                    <input
                      className="ps-input"
                      value={llmForm.fastModel}
                      onChange={e => setLlmForm(p => p && ({ ...p, fastModel: e.target.value }))}
                      placeholder="z. B. gpt-4o-mini"
                    />
                    <label className="ps-label">API key</label>
                    <p className="ps-hint">
                      {llmForm.editingId ? 'Leer = gespeicherten Key behalten.' : 'Pflichtfeld.'}
                    </p>
                    <input
                      type="password"
                      className="ps-input"
                      value={llmForm.fastApiKey}
                      onChange={e => setLlmForm(p => p && ({ ...p, fastApiKey: e.target.value }))}
                      placeholder={llmForm.editingId ? '(unverändert)' : 'sk-...'}
                      autoComplete="off"
                    />

                    <p className="ps-label ps-llm-section-header">⚡ Reasoning-Konfiguration <span className="ps-label-hint">(optional)</span></p>
                    <p className="ps-hint">Wenn leer, werden URL und Key der Fast-Konfiguration verwendet.</p>

                    <label className="ps-label">API base URL <span className="ps-label-hint">(optional)</span></label>
                    <input
                      className="ps-input"
                      value={llmForm.reasoningApiUrl}
                      onChange={e => setLlmForm(p => p && ({ ...p, reasoningApiUrl: e.target.value }))}
                      placeholder="z. B. https://api.eecc.ai (oder leer = Fast-URL)"
                    />
                    <label className="ps-label">Modell</label>
                    <input
                      className="ps-input"
                      value={llmForm.reasoningModel}
                      onChange={e => setLlmForm(p => p && ({ ...p, reasoningModel: e.target.value }))}
                      placeholder="z. B. grok-4.20-0309-reasoning"
                    />
                    <label className="ps-label">API key <span className="ps-label-hint">(optional)</span></label>
                    <p className="ps-hint">Leer = Fast-Key wird genutzt.</p>
                    <input
                      type="password"
                      className="ps-input"
                      value={llmForm.reasoningApiKey}
                      onChange={e => setLlmForm(p => p && ({ ...p, reasoningApiKey: e.target.value }))}
                      placeholder="(optional, Leer = Fast-Key)"
                      autoComplete="off"
                    />

                    <div className="ps-actions">
                      <button
                        type="button"
                        className="ps-save-btn"
                        onClick={() => void handleSaveLlm()}
                        disabled={
                          savingLlm
                          || !llmForm.name.trim()
                          || !llmForm.fastApiUrl.trim()
                          || !llmForm.fastModel.trim()
                        }
                      >
                        {savingLlm
                          ? <><Loader size={13} className="ps-spinner" /> Saving...</>
                          : <><Save size={13} /> Save</>
                        }
                      </button>
                    </div>
                  </div>
                ) : loadingLlms ? (
                  <div className="ps-loading">
                    <Loader size={18} className="ps-spinner" />
                    <span>Lade LLMs...</span>
                  </div>
                ) : (
                  <>
                    <div className="ps-list">
                      {(llmsState?.providers?.length ?? 0) === 0 && (
                        <div className="ps-empty">
                          Keine LLMs eingetragen — der Server nutzt application.yml / AI_API_KEY.
                        </div>
                      )}
                      {llmsState?.providers?.map(p => {
                        const isActive = llmsState?.activeId === p.id;
                        const hasFast = !!(p.fastModel);
                        const hasReasoning = !!(p.reasoningModel);
                        return (
                          <div
                            key={p.id}
                            className={`ps-list-item ps-ai-provider-row${isActive ? ' ps-ai-active' : ''}`}
                          >
                            <div
                              className="ps-ai-provider-main"
                              role="button"
                              tabIndex={0}
                              onClick={() => openEditLlm(p)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openEditLlm(p);
                                }
                              }}
                            >
                              <span className="ps-list-item-name">
                                {p.name}
                                {isActive && <span className="ps-ai-active-badge">Aktiv</span>}
                              </span>
                              <span className="ps-list-item-id">
                                {hasFast && <>Fast: {p.fastModel} · {p.fastApiUrl}</>}
                                {hasFast && hasReasoning && ' — '}
                                {hasReasoning && <>⚡ {p.reasoningModel}{p.reasoningApiUrl ? ` · ${p.reasoningApiUrl}` : ''}</>}
                              </span>
                              {(!p.fastApiKeySet) && (
                                <span className="ps-hint ps-ai-no-key">Kein Fast-Key gesetzt</span>
                              )}
                            </div>
                            <div className="ps-ai-provider-actions">
                              <button
                                type="button"
                                className={`ps-secondary-btn${isActive ? ' ps-btn-active' : ''}`}
                                title="Als aktives LLM setzen"
                                disabled={isActive || activatingLlmId === p.id}
                                onClick={e => {
                                  e.stopPropagation();
                                  void handleActivateLlm(p.id);
                                }}
                              >
                                {activatingLlmId === p.id
                                  ? <Loader size={12} className="ps-spinner" />
                                  : 'Aktiv setzen'}
                              </button>
                              <button
                                type="button"
                                className="ps-secondary-btn"
                                title="Bearbeiten"
                                onClick={e => {
                                  e.stopPropagation();
                                  openEditLlm(p);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ps-list-item-delete"
                                title="LLM löschen"
                                disabled={deletingLlmId === p.id}
                                onClick={e => {
                                  e.stopPropagation();
                                  void handleDeleteLlm(p.id);
                                }}
                              >
                                {deletingLlmId === p.id
                                  ? <Loader size={12} className="ps-spinner" />
                                  : <Trash2 size={12} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="ps-actions">
                      <button type="button" className="ps-add-btn" onClick={openNewLlm}>
                        <Plus size={13} /> Neues LLM
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Rules tab */}
            {initialized && tab === 'rules' && (
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
