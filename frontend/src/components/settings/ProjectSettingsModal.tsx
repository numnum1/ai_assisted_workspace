import { useState, useEffect, useCallback } from 'react';
import { Settings, X, Loader, Plus, Trash2, Save, Check, ChevronLeft, FolderOpen, RefreshCw, Copy, Bot } from 'lucide-react';
import { projectConfigApi, llmApi } from '../../api.ts';
import type {
  AgentPreset,
  ChatToolkitId,
  ProjectConfig,
  Mode,
  WorkspaceModeInfo,
  LlmPublic,
  LlmsListResponse,
} from '../../types.ts';
import { CHAT_TOOLKIT_IDS } from '../../types.ts';
import { usePreferences } from '../../hooks/usePreferences.ts';
import { effectiveModeColor } from '../chat/modeColorTheme.ts';

interface ProjectSettingsModalProps {
  onClose: () => void;
  onModesChanged: () => void;
  onGeneralConfigSaved?: () => void;
  /** Bumps workspace mode cache in the app (file tree labels, subproject dialog) after plugin list refresh */
  onWorkspacePluginsChanged?: () => void;
}

type Tab = 'general' | 'quickChat' | 'modes' | 'agents' | 'workspacePlugins' | 'aiProviders';

interface AgentFormState {
  editingId: string | null;
  id: string;
  name: string;
  modeId: string;
  threadModeId: string;
  useReasoning: boolean;
  disabledToolkits: ChatToolkitId[];
  initialSteeringPlan: string;
}

const TOOLKIT_LABELS: Record<ChatToolkitId, string> = {
  web: 'Websuche',
  wiki: 'Wiki',
  dateisystem: 'Dateisystem',
  assistant: 'Assistant-Tools',
  glossary: 'Glossar (KI)',
};

interface LlmFormState {
  editingId: string | null;
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKey: string;
  reasoningApiUrl: string;
  reasoningModel: string;
  reasoningApiKey: string;
  maxTokens: string;
}

interface ModeForm {
  id: string;
  name: string;
  color: string;
  systemPrompt: string;
  autoIncludes: string;
  useReasoning: boolean;
  agentOnly: boolean;
  llmId: string;
}

/** Next free mode id: `{sourceId}-kopie`, `{sourceId}-kopie-2`, … */
function suggestDuplicateModeId(sourceId: string, existingIds: Set<string>): string {
  const normalized = sourceId.trim().replace(/\s+/g, '-').toLowerCase();
  const base = `${normalized}-kopie`;
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
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
  const { preferences } = usePreferences();
  const uiTheme: 'light' | 'dark' =
    preferences.appearance.theme === 'light' ? 'light' : 'dark';
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
    defaultMode: '',
    workspaceMode: 'default',
    quickChatLlmId: '',
    extraFeatures: { chatDownload: false },
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Modes
  const [modes, setModes] = useState<Mode[]>([]);
  const [modeForm, setModeForm] = useState<ModeForm | null>(null);
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [deletingMode, setDeletingMode] = useState<string | null>(null);
  const [duplicatingModeId, setDuplicatingModeId] = useState<string | null>(null);

  // Agent presets (.assistant/agents.json)
  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentForm, setAgentForm] = useState<AgentFormState | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  // Workspace mode plugins (YAML under app data)
  const [workspaceModesList, setWorkspaceModesList] = useState<WorkspaceModeInfo[]>([]);
  const [workspaceModesDir, setWorkspaceModesDir] = useState<{ path: string; exists: boolean } | null>(null);
  const [loadingWorkspacePlugins, setLoadingWorkspacePlugins] = useState(false);
  const [revealingWorkspaceDir, setRevealingWorkspaceDir] = useState(false);

  // LLMs (AppData ai-providers.json)
  const [llmsState, setLlmsState] = useState<LlmsListResponse | null>(null);
  const [loadingLlms, setLoadingLlms] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [deletingLlmId, setDeletingLlmId] = useState<string | null>(null);
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
    if (!loading && (tab === 'aiProviders' || tab === 'modes' || tab === 'quickChat' || tab === 'agents')) {
      void loadLlms();
    }
  }, [loading, tab, loadLlms]);

  const loadAgents = useCallback(async () => {
    if (!initialized) return;
    setLoadingAgents(true);
    setError(null);
    try {
      const list = await projectConfigApi.listAgents();
      setAgents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agenten konnten nicht geladen werden');
    } finally {
      setLoadingAgents(false);
    }
  }, [initialized]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, llmsData] = await Promise.all([
        projectConfigApi.status(),
        llmApi.list().catch(() => null),
      ]);
      setInitialized(status.initialized);
      if (llmsData) setLlmsState(llmsData);
      if (status.initialized) {
        const [cfg, mds, agentList] = await Promise.all([
          projectConfigApi.get(),
          projectConfigApi.getModes(),
          projectConfigApi.listAgents().catch(() => [] as AgentPreset[]),
        ]);
        setConfig(cfg);
        setModes(mds);
        setAgents(agentList);
      } else {
        setAgents([]);
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
      const [mds, agentList] = await Promise.all([
        projectConfigApi.getModes(),
        projectConfigApi.listAgents().catch(() => [] as AgentPreset[]),
      ]);
      setModes(mds);
      setAgents(agentList);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setInitializing(false);
    }
  };

  // ── General ──────────────────────────────────────────────────────────────────

  const handleSaveQuickChatConfig = async () => {
    setSavingConfig(true);
    setError(null);
    try {
      await projectConfigApi.update(config);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
      onGeneralConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingConfig(false);
    }
  };

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
    setModeForm({
      id: '',
      name: '',
      color: '#89b4fa',
      systemPrompt: '',
      autoIncludes: '',
      useReasoning: false,
      agentOnly: false,
      llmId: '',
    });
  };

  const openEditMode = (mode: Mode) => {
    setEditingModeId(mode.id);
    setModeForm({
      id: mode.id,
      name: mode.name,
      color: mode.color || '#89b4fa',
      systemPrompt: mode.systemPrompt || '',
      autoIncludes: (mode.autoIncludes || []).join('\n'),
      useReasoning: mode.useReasoning ?? false,
      agentOnly: mode.agentOnly ?? false,
      llmId: mode.llmId ?? '',
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
        useReasoning: modeForm.useReasoning,
        agentOnly: modeForm.agentOnly,
        llmId: modeForm.llmId.trim() || undefined,
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

  const handleDuplicateMode = async (mode: Mode) => {
    setDuplicatingModeId(mode.id);
    setError(null);
    try {
      const existingIds = new Set(modes.map((m) => m.id));
      const newId = suggestDuplicateModeId(mode.id, existingIds);
      const duplicate: Mode = {
        ...mode,
        id: newId,
        name: `${mode.name}-Kopie`,
      };
      await projectConfigApi.saveMode(newId, duplicate);
      const updated = await projectConfigApi.getModes();
      setModes(updated);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate mode');
    } finally {
      setDuplicatingModeId(null);
    }
  };

  // ── Agent presets (.assistant/agents.json) ───────────────────────────────────

  const openNewAgent = () => {
    const chatModesList = modes.filter((m) => m.id !== 'prompt-pack');
    setAgentForm({
      editingId: null,
      id: '',
      name: '',
      modeId: chatModesList[0]?.id ?? '',
      threadModeId: '',
      useReasoning: false,
      disabledToolkits: [],
      initialSteeringPlan: '',
    });
  };

  const openEditAgent = (a: AgentPreset) => {
    setAgentForm({
      editingId: a.id,
      id: a.id,
      name: a.name,
      modeId: a.modeId,
      threadModeId: a.threadModeId ?? '',
      useReasoning: a.useReasoning ?? false,
      disabledToolkits: [...(a.disabledToolkits ?? [])],
      initialSteeringPlan: a.initialSteeringPlan ?? '',
    });
  };

  const setAgentToolkitEnabled = (toolkitId: ChatToolkitId, enabled: boolean) => {
    setAgentForm((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.disabledToolkits);
      if (enabled) next.delete(toolkitId);
      else next.add(toolkitId);
      return { ...prev, disabledToolkits: Array.from(next) as ChatToolkitId[] };
    });
  };

  const handleSaveAgent = async () => {
    if (!agentForm || !agentForm.name.trim() || !agentForm.modeId) return;
    const effectiveId =
      agentForm.editingId ?? agentForm.id.trim().replace(/\s+/g, '-').toLowerCase();
    if (agentForm.editingId === null && !agentForm.id.trim()) {
      setError('Bitte eine ID angeben');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(effectiveId)) {
      setError('Ungültige ID (nur Buchstaben, Ziffern, _ und -)');
      return;
    }
    const preset: AgentPreset = {
      id: effectiveId,
      name: agentForm.name.trim(),
      modeId: agentForm.modeId,
      ...(agentForm.threadModeId.trim() ? { threadModeId: agentForm.threadModeId.trim() } : {}),
      useReasoning: agentForm.useReasoning,
      disabledToolkits: [...agentForm.disabledToolkits],
      ...(agentForm.initialSteeringPlan.trim()
        ? { initialSteeringPlan: agentForm.initialSteeringPlan.trim() }
        : {}),
    };
    setSavingAgent(true);
    setError(null);
    try {
      await projectConfigApi.saveAgent(effectiveId, preset);
      await loadAgents();
      setAgentForm(null);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent konnte nicht gespeichert werden');
    } finally {
      setSavingAgent(false);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!window.confirm(`Agent-Vorlage „${id}“ wirklich löschen?`)) return;
    setDeletingAgentId(id);
    setError(null);
    try {
      await projectConfigApi.deleteAgent(id);
      await loadAgents();
      if (agentForm?.editingId === id) setAgentForm(null);
      onModesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent konnte nicht gelöscht werden');
    } finally {
      setDeletingAgentId(null);
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
    maxTokens: '',
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
      maxTokens: p.maxTokens ? String(p.maxTokens) : '',
    });
  };

  const handleSaveLlm = async () => {
    if (!llmForm) return;
    const { editingId, name, fastApiUrl, fastModel, fastApiKey,
            reasoningApiUrl, reasoningModel, reasoningApiKey, maxTokens } = llmForm;
    const hasFast = fastModel.trim().length > 0;
    const hasReasoning = reasoningModel.trim().length > 0;
    if (!name.trim() || (!hasFast && !hasReasoning)) return;
    if (!editingId) {
      if (hasFast && !fastApiKey.trim()) {
        setError('Fast-API-Key ist für einen neuen Eintrag mit Fast-Modell erforderlich');
        return;
      }
      if (hasReasoning && !hasFast && !reasoningApiKey.trim()) {
        setError('Reasoning-API-Key ist erforderlich, wenn kein Fast-Modell angegeben ist');
        return;
      }
    }
    const parsedMaxTokens = parseInt(maxTokens, 10);
    const maxTokensPayload = parsedMaxTokens > 0 ? parsedMaxTokens : undefined;
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
          maxTokens: maxTokensPayload,
        });
      } else {
        await llmApi.create({
          name: name.trim(),
          fastApiUrl: fastApiUrl.trim(),
          fastModel: fastModel.trim(),
          fastApiKey: fastApiKey.trim(),
          reasoningApiUrl: reasoningApiUrl.trim(),
          reasoningModel: reasoningModel.trim(),
          reasoningApiKey: reasoningApiKey.trim(),
          maxTokens: maxTokensPayload,
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
              {(['general', 'quickChat', 'modes', 'agents', 'workspacePlugins', 'aiProviders'] as Tab[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`ps-tab ${tab === t ? 'active' : ''}`}
                  disabled={!initialized && t !== 'aiProviders'}
                  onClick={() => {
                    if (!initialized && t !== 'aiProviders') return;
                    setTab(t);
                    setError(null);
                    setConfigSaved(false);
                  }}
                >
                  {t === 'general'
                    ? 'General'
                    : t === 'quickChat'
                      ? 'Quick Chat'
                      : t === 'modes'
                        ? `Modes (${modes.length})`
                        : t === 'agents'
                          ? (
                              <>
                                <Bot size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
                                Agenten ({agents.length})
                              </>
                            )
                        : t === 'workspacePlugins'
                          ? 'Workspace plugins'
                          : `LLMs (${llmsState?.providers?.length ?? 0})`}
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
                  {modes
                    .filter((m) => m.id !== 'prompt-pack' && !m.agentOnly)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.id})
                      </option>
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

                <label className="ps-label" style={{ marginTop: '1.25rem' }}>
                  Max. Tool-Runden
                </label>
                <p className="ps-hint">
                  Wie viele Tool-Aufruf-Runden (Suche, Datei lesen, …) die KI maximal durchführen darf, bevor sie antwortet. Standard: 6.
                </p>
                <input
                  className="ps-input"
                  type="number"
                  min={1}
                  max={20}
                  value={config.maxToolRounds ?? 6}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setConfig(p => ({ ...p, maxToolRounds: isNaN(v) ? undefined : v }));
                  }}
                  style={{ width: '80px' }}
                />

                <label className="ps-label" style={{ marginTop: '1.25rem' }}>
                  Extra-Funktionen
                </label>
                <p className="ps-hint">
                  Optionale Funktionen, die standardmäßig aus sind und bei Bedarf aktiviert werden können.
                </p>
                <div className="ps-toggle-row">
                  <input
                    id="extraChatDownload"
                    type="checkbox"
                    checked={config.extraFeatures?.chatDownload === true}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        extraFeatures: { ...p.extraFeatures, chatDownload: e.target.checked },
                      }))
                    }
                  />
                  <label htmlFor="extraChatDownload" className="ps-toggle-label">
                    Chat-Verlauf als Datei herunterladen (Markdown-Export in der Chat-Historie)
                  </label>
                </div>

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

            {/* Quick Chat tab (Alt+E floating window; websuche nur dort) */}
            {initialized && tab === 'quickChat' && (
              <div className="ps-tab-content">
                <p className="ps-hint">
                  Das schwebende <strong>Quick Chat</strong>-Fenster (Tastenkürzel <kbd>Alt+E</kbd>) ist für kurze
                  Fragen ohne Projekt-Kontext: Begriffe, Formulierungen, Websuche. Es nutzt kein Datei-Referenzsystem.
                </p>
                <label className="ps-label">LLM für Quick Chat</label>
                <p className="ps-hint">
                  Leer lassen = erstes konfiguriertes LLM aus der Liste. Anbieter verwaltest du unter <strong>LLMs</strong>.
                </p>
                <select
                  className="ps-input"
                  value={config.quickChatLlmId ?? ''}
                  onChange={(e) => setConfig((p) => ({ ...p, quickChatLlmId: e.target.value }))}
                  disabled={loadingLlms || !(llmsState?.providers?.length)}
                >
                  <option value="">Standard (erstes LLM)</option>
                  {(llmsState?.providers ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.fastModel})
                    </option>
                  ))}
                </select>
                {loadingLlms && (
                  <p className="ps-hint" style={{ marginTop: '0.5rem' }}>
                    <Loader size={12} className="ps-spinner" style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                    LLMs werden geladen…
                  </p>
                )}
                <div className="ps-actions" style={{ marginTop: '1rem' }}>
                  <button className="ps-save-btn" onClick={() => void handleSaveQuickChatConfig()} disabled={savingConfig}>
                    {savingConfig ? (
                      <>
                        <Loader size={13} className="ps-spinner" /> Saving...
                      </>
                    ) : configSaved ? (
                      <>
                        <Check size={13} /> Saved
                      </>
                    ) : (
                      <>
                        <Save size={13} /> Save
                      </>
                    )}
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

                    <label className="ps-label">Verfügbarkeit im Chat</label>
                    <p className="ps-hint">
                      „Nur Agenten“: Modus erscheint nicht im Haupt-Chat-Modusmenü, bleibt aber für Agent-Vorlagen und
                      geführte Chats wählbar.
                    </p>
                    <select
                      className="ps-input"
                      value={modeForm.agentOnly ? 'agent' : 'chat'}
                      onChange={(e) =>
                        setModeForm((p) => p && ({ ...p, agentOnly: e.target.value === 'agent' }))
                      }
                    >
                      <option value="chat">Normaler Chat + Agenten</option>
                      <option value="agent">Nur Agenten / geführte Chats</option>
                    </select>

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

                    <label className="ps-label">LLM <span className="ps-label-hint">(optional — leer = globaler aktiver Eintrag)</span></label>
                    <select
                      className="ps-input"
                      value={modeForm.llmId}
                      onChange={e => setModeForm(p => p && ({ ...p, llmId: e.target.value }))}
                    >
                      <option value="">— globaler aktiver Eintrag —</option>
                      {(llmsState?.providers ?? []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    <label className="ps-label">⚡ Reasoning Standard</label>
                    <div className="ps-toggle-row">
                      <input
                        type="checkbox"
                        id="modeUseReasoning"
                        checked={modeForm.useReasoning}
                        onChange={e => setModeForm(p => p && ({ ...p, useReasoning: e.target.checked }))}
                      />
                      <label htmlFor="modeUseReasoning" className="ps-toggle-label">
                        Reasoning-Modus standardmäßig aktiv für diesen Modus
                      </label>
                    </div>

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
                            style={{
                              background:
                                effectiveModeColor(
                                  mode.color || '#89b4fa',
                                  uiTheme,
                                ) ?? (mode.color || '#89b4fa'),
                            }}
                          />
                          <span className="ps-list-item-name">{mode.name}</span>
                          {mode.agentOnly && (
                            <span
                              className="ps-mode-agent-badge"
                              title="Nur Agenten / geführte Chats"
                              aria-label="Nur Agenten"
                            >
                              <Bot size={12} style={{ display: 'block', opacity: 0.85 }} />
                            </span>
                          )}
                          <span className="ps-list-item-id">{mode.id}</span>
                          <button
                            type="button"
                            className="ps-list-item-duplicate"
                            title="Mode duplizieren"
                            onClick={e => {
                              e.stopPropagation();
                              void handleDuplicateMode(mode);
                            }}
                            disabled={duplicatingModeId === mode.id || deletingMode === mode.id}
                          >
                            {duplicatingModeId === mode.id
                              ? <Loader size={12} className="ps-spinner" />
                              : <Copy size={12} />
                            }
                          </button>
                          <button
                            type="button"
                            className="ps-list-item-delete"
                            title="Delete mode"
                            onClick={e => { e.stopPropagation(); handleDeleteMode(mode.id); }}
                            disabled={deletingMode === mode.id || duplicatingModeId === mode.id}
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

            {/* Agent presets (guided chat templates) */}
            {initialized && tab === 'agents' && (
              <div className="ps-tab-content">
                {agentForm ? (
                  <div className="ps-mode-form">
                    <div className="ps-form-nav">
                      <button
                        type="button"
                        className="ps-back-btn"
                        onClick={() => setAgentForm(null)}
                      >
                        <ChevronLeft size={14} />
                        Back
                      </button>
                      <span className="ps-form-title">{agentForm.editingId ? 'Agent-Vorlage bearbeiten' : 'Neue Agent-Vorlage'}</span>
                    </div>

                    <label className="ps-label">
                      ID <span className="ps-label-hint">(nur Buchstaben, Ziffern, _ und -)</span>
                    </label>
                    <input
                      className="ps-input"
                      value={agentForm.id}
                      onChange={(e) => setAgentForm((p) => p && ({ ...p, id: e.target.value }))}
                      placeholder="z. B. revisor"
                      disabled={agentForm.editingId !== null}
                    />

                    <label className="ps-label">Name</label>
                    <input
                      className="ps-input"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm((p) => p && ({ ...p, name: e.target.value }))}
                      placeholder="Anzeigename"
                    />

                    <label className="ps-label">Modus</label>
                    <p className="ps-hint">
                      LLM und Kontext kommen aus dem gewählten Modus (Tab <strong>Modes</strong>).
                    </p>
                    <select
                      className="ps-input"
                      value={agentForm.modeId}
                      onChange={(e) => {
                        const nextModeId = e.target.value;
                        const modeLlm = modes.find((m) => m.id === nextModeId)?.llmId;
                        const lp = modeLlm
                          ? (llmsState?.providers ?? []).find((x) => x.id === modeLlm)
                          : undefined;
                        const supports = !!(lp?.reasoningModel);
                        setAgentForm((p) =>
                          p && {
                            ...p,
                            modeId: nextModeId,
                            useReasoning: supports ? p.useReasoning : false,
                          },
                        );
                      }}
                    >
                      {modes.filter((m) => m.id !== 'prompt-pack').map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </select>

                    <label className="ps-label">
                      Modus für Threads{' '}
                      <span className="ps-label-hint">
                        (optional — leer = wie Eltern-Chat; nur wenn dieser Chat die Vorlage nutzt)
                      </span>
                    </label>
                    <select
                      className="ps-input"
                      value={agentForm.threadModeId}
                      onChange={(e) => setAgentForm((p) => p && ({ ...p, threadModeId: e.target.value }))}
                    >
                      <option value="">— wie Eltern-Chat —</option>
                      {modes.filter((m) => m.id !== 'prompt-pack').map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const modeLlm = modes.find((m) => m.id === agentForm.modeId)?.llmId;
                      const lp = modeLlm
                        ? (llmsState?.providers ?? []).find((x) => x.id === modeLlm)
                        : undefined;
                      const supportsReasoning = !!(lp?.reasoningModel);
                      if (!supportsReasoning) return null;
                      return (
                        <>
                          <label className="ps-label">Reasoning</label>
                          <div className="ps-toggle-row">
                            <input
                              type="checkbox"
                              id="agentPresetUseReasoning"
                              checked={agentForm.useReasoning}
                              onChange={(e) =>
                                setAgentForm((p) => p && ({ ...p, useReasoning: e.target.checked }))
                              }
                            />
                            <label htmlFor="agentPresetUseReasoning" className="ps-toggle-label">
                              Reasoning für diese Vorlage standardmäßig aktiv
                            </label>
                          </div>
                        </>
                      );
                    })()}

                    <label className="ps-label">Toolkits / Features</label>
                    <p className="ps-hint">
                      Aktiviert = Toolkit steht in geführten Chats mit dieser Vorlage zur Verfügung.
                    </p>
                    <div className="ps-toggle-column">
                      {CHAT_TOOLKIT_IDS.map((kitId) => (
                        <div key={kitId} className="ps-toggle-row">
                          <input
                            type="checkbox"
                            id={`agentTk-${kitId}`}
                            checked={!agentForm.disabledToolkits.includes(kitId)}
                            onChange={(e) => setAgentToolkitEnabled(kitId, e.target.checked)}
                          />
                          <label htmlFor={`agentTk-${kitId}`} className="ps-toggle-label">
                            {TOOLKIT_LABELS[kitId]} ({kitId})
                          </label>
                        </div>
                      ))}
                    </div>

                    <label className="ps-label">Arbeitsplan (optional)</label>
                    <textarea
                      className="ps-textarea ps-textarea-tall"
                      value={agentForm.initialSteeringPlan}
                      onChange={(e) =>
                        setAgentForm((p) => p && ({ ...p, initialSteeringPlan: e.target.value }))
                      }
                      placeholder="Markdown für den Start einer geführten Sitzung…"
                      rows={6}
                      spellCheck={false}
                    />

                    <div className="ps-actions">
                      <button
                        type="button"
                        className="ps-save-btn"
                        onClick={() => void handleSaveAgent()}
                        disabled={
                          savingAgent ||
                          !agentForm.name.trim() ||
                          !agentForm.modeId ||
                          (agentForm.editingId === null && !agentForm.id.trim())
                        }
                      >
                        {savingAgent ? (
                          <>
                            <Loader size={13} className="ps-spinner" /> Speichern…
                          </>
                        ) : (
                          <>
                            <Save size={13} /> Vorlage speichern
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {loadingAgents && (
                      <p className="ps-hint">
                        <Loader size={12} className="ps-spinner" style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                        Agenten werden geladen…
                      </p>
                    )}
                    <div className="ps-list">
                      {!loadingAgents && agents.length === 0 && (
                        <div className="ps-empty">Keine Agent-Vorlagen. Lege eine an, um sie beim neuen geführten Chat auszuwählen.</div>
                      )}
                      {agents.map((a) => {
                        const modeOk = modes.some((m) => m.id === a.modeId);
                        const modeLabel = modes.find((m) => m.id === a.modeId)?.name ?? a.modeId;
                        const threadModeLabel = a.threadModeId
                          ? (modes.find((m) => m.id === a.threadModeId)?.name ?? a.threadModeId)
                          : null;
                        const legacyThreadLlm = a.threadLlmId
                          ? ((llmsState?.providers ?? []).find((l) => l.id === a.threadLlmId)?.name
                              ?? a.threadLlmId)
                          : null;
                        const rowTitle = `${a.id} · Modus: ${modeLabel}${
                          threadModeLabel ? ` · Thread-Modus: ${threadModeLabel}` : ''
                        }${legacyThreadLlm ? ` · (Legacy Thread-LLM: ${legacyThreadLlm})` : ''}${
                          !modeOk ? ' · Modus fehlt' : ''
                        }`;
                        return (
                          <div key={a.id} className="ps-list-item" onClick={() => openEditAgent(a)} title={rowTitle}>
                            <Bot size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
                            <span className="ps-list-item-name">{a.name}</span>
                            <span className="ps-list-item-id">
                              {a.id}
                              {!modeOk ? ' · Modus?' : ` · ${modeLabel}`}
                            </span>
                            <button
                              type="button"
                              className="ps-list-item-delete"
                              title="Vorlage löschen"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteAgent(a.id);
                              }}
                              disabled={deletingAgentId === a.id}
                            >
                              {deletingAgentId === a.id ? (
                                <Loader size={12} className="ps-spinner" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="ps-actions">
                      <button type="button" className="ps-add-btn" onClick={openNewAgent}>
                        <Plus size={13} /> Neue Vorlage
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
                  Jeder Eintrag benötigt mindestens eine <strong>Fast</strong>- <em>oder</em> eine <strong>⚡ Reasoning</strong>-Konfiguration —
                  jeweils mit eigenem API-URL, Key und Modell. Welcher Eintrag genutzt wird, legst du pro Modus
                  im Tab <em>Modes</em> fest. Kein Eintrag zugewiesen? Der erste in der Liste wird als Fallback verwendet.
                  Bei leerer Liste greift der Server auf <code>application.yml</code> / env zurück.
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

                    <p className="ps-label ps-llm-section-header">Fast-Konfiguration <span className="ps-label-hint">(optional, wenn Reasoning angegeben)</span></p>

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
                      {llmForm.editingId
                        ? 'Leer = gespeicherten Key behalten.'
                        : llmForm.fastModel.trim()
                          ? 'Pflichtfeld bei Fast-Modell.'
                          : 'Optional, wenn kein Fast-Modell angegeben.'}
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

                    <p className="ps-label ps-llm-section-header">Kontextfenster</p>

                    <label className="ps-label">Max Context Tokens <span className="ps-label-hint">(optional)</span></label>
                    <p className="ps-hint">Geschätzter Token-Verbrauch wird im Chat als Fortschrittsbalken angezeigt. Leer lassen = kein Limit.</p>
                    <input
                      type="number"
                      className="ps-input"
                      value={llmForm.maxTokens}
                      onChange={e => setLlmForm(p => p && ({ ...p, maxTokens: e.target.value }))}
                      placeholder="z. B. 128000"
                      min={0}
                    />

                    <div className="ps-actions">
                      <button
                        type="button"
                        className="ps-save-btn"
                        onClick={() => void handleSaveLlm()}
                        disabled={
                          savingLlm
                          || !llmForm.name.trim()
                          || (!llmForm.fastModel.trim() && !llmForm.reasoningModel.trim())
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
                        const hasFast = !!(p.fastModel);
                        const hasReasoning = !!(p.reasoningModel);
                        return (
                          <div
                            key={p.id}
                            className="ps-list-item ps-ai-provider-row"
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
                              <span className="ps-list-item-name">{p.name}</span>
                              <span className="ps-list-item-id">
                                {hasFast && <>Fast: {p.fastModel} · {p.fastApiUrl}</>}
                                {hasFast && hasReasoning && ' — '}
                                {hasReasoning && <>⚡ {p.reasoningModel}{p.reasoningApiUrl ? ` · ${p.reasoningApiUrl}` : ''}</>}
                              </span>
                              {(hasFast && !p.fastApiKeySet) && (
                                <span className="ps-hint ps-ai-no-key">Kein Fast-Key gesetzt</span>
                              )}
                              {(!hasFast && hasReasoning && !p.reasoningApiKeySet) && (
                                <span className="ps-hint ps-ai-no-key">Kein Reasoning-Key gesetzt</span>
                              )}
                            </div>
                            <div className="ps-ai-provider-actions">
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

          </>
        )}
      </div>
    </div>
  );
}
