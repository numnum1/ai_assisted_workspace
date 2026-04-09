import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw, Maximize2, Minimize2, Upload } from 'lucide-react';
import { FileTreeOutliner } from './components/outliner/FileTreeOutliner.tsx';
import { MarkdownFileEditor } from './components/editor/MarkdownFileEditor.tsx';
import { SubprojectTypeDialog } from './components/settings/SubprojectTypeDialog.tsx';
import { MetaPanel } from './components/meta/MetaPanel.tsx';
import { ChatPanel } from './components/chat/ChatPanel.tsx';
import { FieldEditorPanel } from './components/editor/FieldEditorPanel.tsx';
import { PromptPackModal } from './components/chat/PromptPackModal.tsx';
import { ContextBar } from './components/chat/ContextBar.tsx';
import { CommandPalette } from './components/git/CommandPalette.tsx';
import { GitCredentialsDialog } from './components/git/GitCredentialsDialog.tsx';
import { FileHistoryModal } from './components/git/FileHistoryModal.tsx';
import { ProjectSettingsModal } from './components/settings/ProjectSettingsModal.tsx';
import type { CommandAction } from './components/git/CommandPalette.tsx';
import type { Mode, GitStatus, GitSyncStatus, MetaSelection, MetaNodeType, NodeMeta, SelectionContext, AltVersionSession, LlmPublic } from './types.ts';
import { CHAT_TOOLKIT_IDS } from './types.ts';
import { modesApi, gitApi, projectApi, projectConfigApi, bookApi, llmApi, chatApi, AuthRequiredError } from './api.ts';
import { Settings } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useChapter } from './hooks/useChapter.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';
import { useChatHistory } from './hooks/useChatHistory.ts';
import { useWorkspaceMode } from './hooks/useWorkspaceMode.ts';
import { useWorkspaceLevelConfigMap } from './hooks/useWorkspaceLevelConfigMap.ts';
import { useOutlinerScope } from './hooks/useOutlinerScope.ts';
import { useFileTabs } from './hooks/useFileTabs.ts';
import { EditorTabs } from './components/editor/EditorTabs.tsx';
import { SearchPanel } from './components/editor/SearchPanel.tsx';
import { getMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';
import { AlternativeVersionPanel } from './components/editor/AlternativeVersionPanel.tsx';
import { QuickChatWindow } from './components/chat/QuickChatWindow.tsx';

const LLM_PREFS_KEY = 'chat-llm-prefs';
const CHAT_DISABLED_TOOLKITS_KEY = 'chat-disabled-toolkits';

function loadInitialDisabledToolkits(): Set<string> {
  try {
    const raw = localStorage.getItem(CHAT_DISABLED_TOOLKITS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
    }
    if (localStorage.getItem('chat-tools-disabled') === 'true') {
      localStorage.removeItem('chat-tools-disabled');
      return new Set(CHAT_TOOLKIT_IDS);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDisabledToolkits(s: Set<string>) {
  try {
    localStorage.setItem(CHAT_DISABLED_TOOLKITS_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function loadLlmPrefs(): { llmId: string | null; useReasoning: boolean } | null {
  try {
    const raw = localStorage.getItem(LLM_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { llmId: string | null; useReasoning: boolean; useWebSearch?: boolean };
    return { llmId: parsed.llmId, useReasoning: parsed.useReasoning };
  } catch {
    return null;
  }
}

function saveLlmPrefs(llmId: string | undefined, useReasoning: boolean) {
  try {
    localStorage.setItem(LLM_PREFS_KEY, JSON.stringify({ llmId: llmId ?? null, useReasoning }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function App() {
  const project = useProject();
  const chapter = useChapter();
  const refs = useReferencedFiles();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');
  const [useReasoning, setUseReasoning] = useState(false);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);
  const [llms, setLlms] = useState<LlmPublic[]>([]);
  const [disabledToolkits, setDisabledToolkits] = useState(loadInitialDisabledToolkits);

  const prefsHydratedRef = useRef(false);

  const handleToggleReasoning = useCallback(() => setUseReasoning(v => !v), []);
  const handleToggleToolkit = useCallback((kitId: string) => {
    setDisabledToolkits((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) {
        next.delete(kitId);
      } else {
        next.add(kitId);
      }
      return next;
    });
  }, []);

  const handleLlmChange = useCallback((id: string | undefined) => {
    setModeLlmId(id);
    if (id) {
      const llm = llms.find((l) => l.id === id);
      if (llm) {
        const hasReasoning = !!llm.reasoningModel;
        const hasFast = !!llm.fastModel;
        if (!hasReasoning) {
          setUseReasoning(false);
        } else if (!hasFast) {
          setUseReasoning(true);
        }
        // both available → keep current toggle state
      }
    } else {
      const mode = modes.find((m) => m.id === selectedMode);
      setUseReasoning(mode?.useReasoning ?? false);
    }
  }, [llms, modes, selectedMode]);

  const reasoningAvailable = useMemo(() => {
    if (!modeLlmId) return true;
    const llm = llms.find((l) => l.id === modeLlmId);
    return !llm || !!llm.reasoningModel;
  }, [modeLlmId, llms]);

  const fastAvailable = useMemo(() => {
    if (!modeLlmId) return true;
    const llm = llms.find((l) => l.id === modeLlmId);
    return !llm || !!llm.fastModel;
  }, [modeLlmId, llms]);

  const handleModeChange = useCallback((modeId: string, modeList?: typeof modes) => {
    setSelectedMode(modeId);
    const list = modeList ?? modes;
    const m = list.find(x => x.id === modeId);
    const llmId = m?.llmId ?? undefined;
    setModeLlmId(llmId);

    let newUseReasoning = m?.useReasoning ?? false;
    if (llmId) {
      const llm = llms.find((l) => l.id === llmId);
      if (llm) {
        const hasReasoning = !!llm.reasoningModel;
        const hasFast = !!llm.fastModel;
        if (!hasReasoning) {
          newUseReasoning = false;
        } else if (!hasFast) {
          newUseReasoning = true;
        }
        // both available → use mode preference
      }
    }
    setUseReasoning(newUseReasoning);
  }, [modes, llms]);

  const history = useChatHistory(selectedMode, project.projectPath);
  const chat = useChat(history.updateMessages);

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [workspaceModesRefreshNonce, setWorkspaceModesRefreshNonce] = useState(0);
  const [inlineChaptersNonce, setInlineChaptersNonce] = useState(0);
  const [subprojectDialog, setSubprojectDialog] = useState<{ path: string; initialType?: string | null } | null>(null);
  const outlinerScope = useOutlinerScope(project.projectPath ? project.projectPath : null);

  // Ctrl+L: capture editor selection for chat
  const [activeSelection, setActiveSelection] = useState<SelectionContext | null>(null);
  const activeSelectionReplaceFnRef = useRef<((from: number, to: number, text: string) => void) | null>(null);
  const chatFocusTriggerRef = useRef<(() => void) | null>(null);

  // Ctrl+Alt+A: alternative version panel
  const [altVersionSession, setAltVersionSession] = useState<AltVersionSession | null>(null);

  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();

  const handleCtrlL = useCallback((sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => {
    setActiveSelection(sel);
    activeSelectionReplaceFnRef.current = replaceFn;
    chatFocusTriggerRef.current?.();
  }, []);

  const handleReplaceSelection = useCallback((replacement: string, ctx: SelectionContext) => {
    if (!activeSelectionReplaceFnRef.current) return;
    activeSelectionReplaceFnRef.current(ctx.from, ctx.to, replacement);
    activeSelectionReplaceFnRef.current = null;
  }, []);

  const handleDismissSelection = useCallback(() => {
    setActiveSelection(null);
    activeSelectionReplaceFnRef.current = null;
  }, []);

  const handleAltVersion = useCallback((session: AltVersionSession) => {
    setAltVersionSession(session);
  }, []);

  // Project root changes: reset structure and editor state
  useEffect(() => {
    if (!project.projectPath) return;
    chapter.setProjectPath(project.projectPath);
    chapter.closeChapter();
    setSelectedMeta(null);
    setMetaExpanded(false);
    setFocusedField(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath]);

  // Load messages when switching conversations
  useEffect(() => {
    if (history.activeConversation) {
      chat.loadMessages(history.activeConversation.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.activeId]);

  function resolveDefaultModeId(mds: Mode[], configured: string | undefined): string {
    const id = configured?.trim() ?? '';
    if (id && mds.some((m) => m.id === id)) return id;
    if (mds.some((m) => m.id === 'review')) return 'review';
    if (mds.length > 0) return mds[0].id;
    return 'review';
  }

  const loadModes = useCallback(async () => {
    try {
      const [mds, status] = await Promise.all([modesApi.getAll(), projectConfigApi.status()]);
      setModes(mds);
      const chatModes = mds.filter(m => m.id !== 'prompt-pack');
      let configured: string | undefined;
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
        } catch {
          /* ignore */
        }
      }
      if (configured === 'prompt-pack') configured = undefined;
      const resolvedId = resolveDefaultModeId(chatModes, configured);
      const resolvedMode = chatModes.find(m => m.id === resolvedId);
      setSelectedMode(resolvedId);
      setUseReasoning(resolvedMode?.useReasoning ?? false);
      setModeLlmId(resolvedMode?.llmId ?? undefined);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    prefsHydratedRef.current = false;
    let cancelled = false;
    const llmsRef: { current: LlmPublic[] } = { current: [] };
    const llmsPromise = llmApi
      .list()
      .then((r) => {
        if (!cancelled) {
          setLlms(r.providers);
          llmsRef.current = r.providers;
          setWebSearchAvailable(!!r.webSearchAvailable);
        }
      })
      .catch(console.error);

    Promise.all([loadModes(), llmsPromise]).then(() => {
      if (cancelled) return;
      const prefs = loadLlmPrefs();
      if (prefs) {
        const { llmId, useReasoning: savedReasoning } = prefs;
        if (llmId !== null) {
          const llm = llmsRef.current.find((l) => l.id === llmId);
          if (llm) {
            setModeLlmId(llmId);
            const hasReasoning = !!llm.reasoningModel;
            const hasFast = !!llm.fastModel;
            if (!hasReasoning) setUseReasoning(false);
            else if (!hasFast) setUseReasoning(true);
            else setUseReasoning(savedReasoning);
          } else {
            setUseReasoning(savedReasoning);
          }
        } else {
          setUseReasoning(savedReasoning);
        }
      }
      prefsHydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [loadModes, project.projectPath]);

  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    saveLlmPrefs(modeLlmId, useReasoning);
  }, [modeLlmId, useReasoning]);

  useEffect(() => {
    saveDisabledToolkits(disabledToolkits);
  }, [disabledToolkits]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'e' && e.key !== 'E')) {
        return;
      }
      e.preventDefault();
      setQuickChatOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [focusedField, setFocusedField] = useState<{ fieldKey: string; fieldLabel: string; value: string } | null>(null);

  const handleSaveMeta = useCallback(async (
    type: MetaNodeType,
    meta: NodeMeta,
    chapterId: string,
    sceneId?: string,
    actionId?: string,
  ) => {
    if (type === 'book') {
      await bookApi.updateMeta(meta, chapter.structureRoot ?? undefined);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'chapter') {
      await chapter.updateChapterMeta(chapterId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'scene' && sceneId) {
      await chapter.updateSceneMeta(chapterId, sceneId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    } else if (type === 'action' && sceneId && actionId) {
      await chapter.updateActionMeta(chapterId, sceneId, actionId, meta);
      setSelectedMeta(prev => prev ? { ...prev, meta } : null);
    }
  }, [chapter]);

  const handleApplyFieldUpdate = useCallback(async (field: string, value: string) => {
    if (!selectedMeta || selectedMeta.type !== 'scene' || !selectedMeta.sceneId) return;
    const curr = selectedMeta.meta;
    const newMeta: NodeMeta = field === 'title'
      ? { ...curr, title: value }
      : field === 'description'
        ? { ...curr, description: value }
        : { ...curr, extras: { ...(curr.extras ?? {}), [field]: value } };
    await handleSaveMeta('scene', newMeta, selectedMeta.chapterId, selectedMeta.sceneId);
    // Keep field editor in sync when the AI applies a suggestion via chat
    setFocusedField(prev => prev?.fieldKey === field ? { ...prev, value } : prev);
  }, [selectedMeta, handleSaveMeta]);

  const handleOpenFieldEditor = useCallback((fieldKey: string, fieldLabel: string, value: string) => {
    setFocusedField({ fieldKey, fieldLabel, value });
    setMetaExpanded(false);
  }, []);

  const handleFieldEditorSave = useCallback(async (value: string) => {
    if (!focusedField) return;
    await handleApplyFieldUpdate(focusedField.fieldKey, value);
  }, [focusedField, handleApplyFieldUpdate]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [promptPackOpen, setPromptPackOpen] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportChatFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (typeof text !== 'string') return;
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            window.alert('Invalid chat history file: expected a JSON array of conversations.');
            return;
          }
          history.importConversations(parsed);
        } catch {
          window.alert('Failed to parse chat history file. Make sure it is a valid JSON file.');
        }
      };
      reader.readAsText(file);
    },
    [history],
  );
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null);
  const hasUncommitted = !gitStatus?.isClean;

  const showCredentialsDialog = useCallback((retry: () => void) => {
    setPendingRetry(() => retry);
    setCredDialogOpen(true);
  }, []);

  const fetchGitState = useCallback(async () => {
    try {
      const [ahead, status] = await Promise.all([
        gitApi.aheadBehind(),
        gitApi.status(),
      ]);
      setSyncStatus(ahead);
      setGitStatus(status);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        showCredentialsDialog(fetchGitState);
      }
    }
  }, [showCredentialsDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGitRevert = useCallback(
    async (path: string, isDirectory: boolean) => {
      const label = isDirectory ? `Ordner „${path}“` : `Datei „${path}“`;
      if (
        !window.confirm(
          `Alle Änderungen in ${label} wirklich verwerfen?\nDieser Vorgang kann nicht rückgängig gemacht werden.`,
        )
      ) {
        return;
      }
      try {
        if (isDirectory) {
          await gitApi.revertDirectory(path);
        } else {
          const isUntracked = gitStatus?.untracked?.includes(path) ?? false;
          await gitApi.revertFile(path, isUntracked);
        }
        setTreeRefreshKey((k) => k + 1);
        await fetchGitState();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Revert fehlgeschlagen');
      }
    },
    [gitStatus, fetchGitState],
  );

  useEffect(() => {
    fetchGitState();
    const interval = setInterval(fetchGitState, 30_000);
    return () => clearInterval(interval);
  }, [fetchGitState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [centerPaneWide, setCenterPaneWide] = useState(false);

  const handleToggleCenterPanels = useCallback(() => {
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (!left || !right) return;
    if (left.isCollapsed() && right.isCollapsed()) {
      left.expand();
      right.expand();
      setCenterPaneWide(false);
    } else {
      left.collapse();
      right.collapse();
      setCenterPaneWide(true);
    }
  }, []);

  const syncBadge = useMemo(() => {
    if (!syncStatus) return null;
    if (syncStatus.behind > 0)
      return (
        <span className="palette-git-badge behind">
          <ArrowDown size={11} />
          {syncStatus.behind}
        </span>
      );
    if (syncStatus.ahead > 0)
      return (
        <span className="palette-git-badge ahead">
          <ArrowUp size={11} />
          {syncStatus.ahead}
        </span>
      );
    return (
      <span className="palette-git-badge synced">
        <Check size={11} />
      </span>
    );
  }, [syncStatus]);

  const handleOpenProject = useCallback(async (path: string) => {
    await project.openProject(path);
    await chapter.refreshChapters();
    loadModes();
  }, [project, chapter, loadModes]);

  const browseAndOpenProject = useCallback(async () => {
    try {
      const r = await projectApi.browse();
      if (r.cancelled || !r.path) return;
      await handleOpenProject(r.path);
    } catch (e) {
      console.error(e);
    }
  }, [handleOpenProject]);

  const workspaceModeId = chapter.activeSubprojectType ?? 'default';
  const levelConfigByModeId = useWorkspaceLevelConfigMap(project.projectPath ?? null, workspaceModesRefreshNonce);
  const {
    schema: workspaceModeSchema,
    metaSchemas: workspaceMetaSchemas,
    refresh: refreshWorkspaceModeSchema,
  } = useWorkspaceMode(project.projectPath ?? '', workspaceModeId);

  const proseEditorMode = chapter.activeChapter
    ? (workspaceModeSchema?.editorMode ?? 'prose')
    : 'standard';

  const fieldLabels = useMemo(() => {
    const schema = workspaceMetaSchemas?.['scene'];
    if (!schema) return {} as Record<string, string>;
    return Object.fromEntries(schema.fields.map(f => [f.key, f.label])) as Record<string, string>;
  }, [workspaceMetaSchemas]);

  const MediaProjectEditor =
    getMediaProjectPlugin(workspaceModeId)?.ViewComponent ?? DefaultMediaProjectEditor;

  const fileEditor = useFileTabs(project.projectPath ?? null);

  const commandActions: CommandAction[] = useMemo(() => {
    const actions: CommandAction[] = [
      {
        id: 'open-folder',
        label: 'Open Folder',
        shortcut: 'Ctrl+Shift+A',
        icon: <FolderOpen size={16} />,
        handler: () => {},
      },
      {
        id: 'project-settings',
        label: 'Project Settings',
        icon: <Settings size={16} />,
        handler: () => { setPaletteOpen(false); setSettingsOpen(true); },
      },
      {
        id: 'import-chat',
        label: 'Import Chat History',
        icon: <Upload size={16} />,
        handler: () => {
          importFileInputRef.current?.click();
        },
      },
      hasUncommitted
        ? {
            id: 'git-commit',
            label: 'Commit',
            icon: <GitCommitHorizontal size={16} />,
            handler: () => {},
          }
        : {
            id: 'git-sync',
            label: 'Sync',
            icon: <RefreshCw size={16} />,
            badge: syncBadge,
            handler: () => {},
          },
    ];
    return actions;
  }, [hasUncommitted, syncBadge]);

  const showMetaChrome =
    selectedMeta != null && (chapter.activeChapter != null || selectedMeta.type === 'book');

  const onProjectGeneralSaved = useCallback(() => {
    loadModes();
    void refreshWorkspaceModeSchema();
  }, [loadModes, refreshWorkspaceModeSchema]);

  const onWorkspacePluginsChanged = useCallback(() => {
    setWorkspaceModesRefreshNonce((n) => n + 1);
    void refreshWorkspaceModeSchema();
  }, [refreshWorkspaceModeSchema]);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      // Derive activeFile: scene JSON when a scene is selected, otherwise the open file
      const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
        ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
        : (fileEditor.selectedPath ?? null);
      chat.sendMessage(
        message,
        activeFile,
        selectedMode,
        refs.referencedFiles,
        mode?.name,
        mode?.color,
        useReasoning,
        modeLlmId,
        activeSelection ?? undefined,
        focusedField?.fieldKey ?? null,
        [...disabledToolkits],
      );
      // Clear active selection after sending — the Replace button will use stored selectionContext on the message
      setActiveSelection(null);
    },
    [
      chat,
      selectedMode,
      modes,
      refs.referencedFiles,
      useReasoning,
      modeLlmId,
      activeSelection,
      selectedMeta,
      chapter.structureRoot,
      fileEditor.selectedPath,
      focusedField,
      disabledToolkits,
    ],
  );

  const handleEditMessage = useCallback(
    (index: number, newContent: string) => {
      const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
        ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
        : (fileEditor.selectedPath ?? null);
      chat.editMessage(index, newContent, {
        activeFile,
        mode: selectedMode,
        referencedFiles: refs.referencedFiles,
        useReasoning,
        llmId: modeLlmId,
        selectionContext: activeSelection ?? undefined,
        activeFieldKey: focusedField?.fieldKey ?? null,
        disabledToolkits: [...disabledToolkits],
      });
      setActiveSelection(null);
    },
    [
      chat,
      selectedMode,
      refs.referencedFiles,
      useReasoning,
      modeLlmId,
      activeSelection,
      selectedMeta,
      chapter.structureRoot,
      fileEditor.selectedPath,
      focusedField,
      disabledToolkits,
    ],
  );

  const modesForChat = useMemo(() => modes.filter(m => m.id !== 'prompt-pack'), [modes]);

  const handlePromptPackGenerate = useCallback(
    (message: string, files: string[]) => {
      const m = modes.find(x => x.id === 'prompt-pack');
      chat.sendMessage(
        message,
        null,
        'prompt-pack',
        files,
        m?.name ?? 'Prompt-Paket',
        m?.color ?? '#f9e2af',
        useReasoning,
        modeLlmId,
        undefined,
        null,
        [...disabledToolkits],
      );
      setPromptPackOpen(false);
    },
    [chat, modes, useReasoning, modeLlmId, disabledToolkits],
  );

  useEffect(() => {
    if (!modes.length) return;
    if (selectedMode === 'prompt-pack') {
      const chatModes = modes.filter(x => x.id !== 'prompt-pack');
      const fallbackId = resolveDefaultModeId(chatModes, undefined);
      handleModeChange(fallbackId, chatModes);
    }
  }, [modes, selectedMode, handleModeChange]);

  const handleNewChat = useCallback(() => {
    history.createConversation(selectedMode);
  }, [history, selectedMode]);

  const handleDiscardCurrentChat = useCallback(() => {
    history.discardActiveAndCreateConversation(selectedMode);
  }, [history, selectedMode]);

  const handleForkToNewConversation = useCallback((index: number) => {
    const forkedMessages = chat.messages.slice(0, index + 1);
    const baseTitle = history.activeConversation?.title ?? 'Chat';
    const base = `${baseTitle}-fork`;
    const existingTitles = new Set(history.conversations.map((c) => c.title));
    let n = 1;
    while (existingTitles.has(`${base} (${n})`)) n++;
    history.createConversation(selectedMode, forkedMessages, `${base} (${n})`);
  }, [chat.messages, history, selectedMode]);

  const handleSwitchChat = useCallback((id: string) => {
    history.switchConversation(id);
  }, [history]);

  const activeChapterTitle = chapter.activeChapter?.meta.title ?? null;

  return (
    <div className="app">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={commandActions}
        onOpenFolder={browseAndOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus ?? undefined}
        onAuthRequired={showCredentialsDialog}
      />

      <Group orientation="horizontal" className="app-panels">
        <Panel
          id="outliner"
          panelRef={leftPanelRef}
          defaultSize="18%"
          minSize="10%"
          maxSize="50%"
          collapsible
          collapsedSize={0}
        >
          <div className="left-column">
            <div className={`outliner-slot${showMetaChrome ? ' split' : ''}`}>
              <FileTreeOutliner
                projectPath={project.projectPath ?? null}
                selectedPath={fileEditor.selectedPath}
                onSelectFile={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  void fileEditor.openFile(path);
                }}
              onOpenFileMeta={(path) => {
                  chapter.closeChapter();
                  setSelectedMeta(null);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  void fileEditor.openFile(path);
                }}
                onRevealInExplorer={() => projectApi.reveal().catch(console.error)}
                refreshNonce={treeRefreshKey}
                onTreeMutated={() => setTreeRefreshKey((k) => k + 1)}
                onFsChange={fileEditor.syncWithFilesystem}
                inlineChaptersRefreshNonce={inlineChaptersNonce}
                activeChapterId={chapter.activeChapter?.id ?? null}
                activeStructureRoot={chapter.structureRoot}
                editorPosition={chapter.editorPosition}
                levelConfigByModeId={levelConfigByModeId}
                onActivateSubprojectStructure={async (subPath, subType, chapterId, scroll, selection) => {
                  chapter.setStructureRoot(subPath, subType);
                  setMetaExpanded(false);
                  setFocusedField(null);
                  await chapter.openChapter(chapterId, scroll ?? null);
                  setSelectedMeta(selection);
                }}
                runSubprojectMutation={async (subPath, subType, fn) => {
                  chapter.setStructureRoot(subPath, subType);
                  await fn();
                }}
                onSubprojectStructureChanged={() => setInlineChaptersNonce((n) => n + 1)}
                onOpenBookMeta={async (subPath, subType) => {
                  chapter.setStructureRoot(subPath, subType);
                  const meta = await bookApi.getMeta(subPath);
                  setSelectedMeta({ type: 'book', chapterId: '', meta });
                  setMetaExpanded(false);
                }}
                onCreateChapterInSubproject={async (subPath, subType, title) => {
                  chapter.setStructureRoot(subPath, subType);
                  await chapter.createChapter(title);
                  setInlineChaptersNonce((n) => n + 1);
                }}
                onConfigureSubproject={(path, existingType) => {
                  setSubprojectDialog({ path, initialType: existingType ?? undefined });
                }}
                scopeToPath={outlinerScope.scopePath}
                onClearOutlinerScope={outlinerScope.clearScopePath}
                onSetOutlinerScope={outlinerScope.setScopePath}
                onScopeInvalidated={outlinerScope.clearScopePath}
                gitStatus={gitStatus ?? undefined}
                onGitRevert={handleGitRevert}
                onShowFileHistory={setFileHistoryPath}
              />
            </div>

            {showMetaChrome && selectedMeta && (
              <div className="meta-panel-slot">
                <MetaPanel
                  selection={selectedMeta}
                  metaSchemas={workspaceMetaSchemas}
                  onSave={handleSaveMeta}
                  onClose={() => { setSelectedMeta(null); setMetaExpanded(false); setFocusedField(null); }}
                  onExpand={() => setMetaExpanded(true)}
                  onFocusField={handleOpenFieldEditor}
                />
              </div>
            )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel id="editor" defaultSize="45%" minSize="15%">
          <div className="center-editor-pane">
          <EditorTabs
            tabs={fileEditor.tabs}
            activeTabPath={fileEditor.activeTabPath}
            onSelectTab={(path) => void fileEditor.openFile(path)}
            onCloseTab={fileEditor.closeTab}
            onCloseOtherTabs={fileEditor.closeOtherTabs}
            onCloseAllTabs={fileEditor.closeAllTabs}
          />
          {searchOpen && (
            <SearchPanel
              onOpenFile={(path) => {
                void fileEditor.openFile(path);
                setSearchOpen(false);
              }}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <button
            type="button"
            className="center-pane-wide-toggle"
            onClick={handleToggleCenterPanels}
            title={centerPaneWide ? 'Seitenleisten wieder anzeigen' : 'Seitenleisten ausblenden (breiter Editor)'}
            aria-pressed={centerPaneWide}
          >
            {centerPaneWide ? <Minimize2 size={17} strokeWidth={2} /> : <Maximize2 size={17} strokeWidth={2} />}
          </button>
          {focusedField && showMetaChrome ? (
            <div className="field-editor-center">
              <FieldEditorPanel
                fieldLabel={focusedField.fieldLabel}
                sceneTitle={selectedMeta?.meta.title || undefined}
                value={focusedField.value}
                onSave={handleFieldEditorSave}
                onClose={() => setFocusedField(null)}
              />
            </div>
          ) : metaExpanded && showMetaChrome ? (
            <div className="meta-panel-center">
              <MetaPanel
                selection={selectedMeta!}
                metaSchemas={workspaceMetaSchemas}
                onSave={handleSaveMeta}
                onClose={() => setMetaExpanded(false)}
                expanded={true}
                onFocusField={handleOpenFieldEditor}
              />
            </div>
          ) : !chapter.activeChapter ? (
            <MarkdownFileEditor
              path={fileEditor.selectedPath}
              content={fileEditor.content}
              dirty={fileEditor.dirty}
              loading={fileEditor.loading}
              error={fileEditor.error}
              onChange={fileEditor.setContent}
              onSave={() => { void fileEditor.save(); fetchGitState(); }}
              onClearError={fileEditor.clearError}
              onCloseFile={fileEditor.closeFile}
              onCtrlL={handleCtrlL}
              onAltVersion={handleAltVersion}
            />
          ) : (
            <MediaProjectEditor
              editorMode={proseEditorMode}
              proseLeafAtScene={workspaceModeSchema?.proseLeafLevel === 'scene'}
              chapter={chapter.activeChapter}
              actionContents={chapter.actionContents}
              scrollTarget={chapter.scrollTarget}
              hasDirtyActions={chapter.hasDirtyActions}
              onActionChange={chapter.updateActionContent}
              onActionSave={chapter.saveAction}
              onSaveAll={() => { chapter.saveAllDirty(); fetchGitState(); }}
              onClose={chapter.closeChapter}
              onScrollTargetConsumed={chapter.clearScrollTarget}
              onEditorFocus={chapter.updateEditorPosition}
              onCtrlL={handleCtrlL}
              onAltVersion={handleAltVersion}
            />
          )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel
          id="chat"
          panelRef={rightPanelRef}
          defaultSize="37%"
          minSize="15%"
          collapsible
          collapsedSize={0}
        >
          <ChatPanel
            messages={chat.messages}
            streaming={chat.streaming}
            error={chat.error}
            toolActivity={chat.toolActivity}
            modes={modesForChat}
            selectedMode={selectedMode}
            referencedFiles={refs.referencedFiles}
            conversations={history.conversations}
            activeConversationId={history.activeId}
            useReasoning={useReasoning}
            onToggleReasoning={handleToggleReasoning}
            disabledToolkits={disabledToolkits}
            onToggleToolkit={handleToggleToolkit}
            reasoningAvailable={reasoningAvailable}
            fastAvailable={fastAvailable}
            onModeChange={handleModeChange}
            llms={llms}
            selectedLlmId={modeLlmId}
            onLlmChange={handleLlmChange}
            onSend={handleSendMessage}
            onStop={chat.stopStreaming}
            onRetry={chat.retry}
            onAddFile={refs.addFile}
            onRemoveFile={refs.removeFile}
            onForkFromMessage={chat.forkFromMessage}
            onForkToNewConversation={handleForkToNewConversation}
            onEditMessage={handleEditMessage}
            onDeleteMessage={chat.deleteMessage}
            onNewChat={handleNewChat}
            onDiscardCurrentChat={handleDiscardCurrentChat}
            onSwitchChat={handleSwitchChat}
            onDeleteChat={history.deleteConversation}
            onRenameChat={history.renameConversation}
            onToggleSavedToProject={history.toggleSavedToProject}
            onClearAllBrowserChats={history.clearAllBrowserChats}
            clearAllBrowserChatsDisabled={!project.projectPath || !history.hydrated}
            onOpenPromptPack={() => setPromptPackOpen(true)}
            structureRoot={chapter.structureRoot}
            activeSelection={activeSelection}
            onDismissSelection={handleDismissSelection}
            onReplaceSelection={handleReplaceSelection}
            onApplyFieldUpdate={handleApplyFieldUpdate}
            fieldLabels={fieldLabels}
            chatFocusTriggerRef={chatFocusTriggerRef}
            onFileChanged={(path) => {
              if (fileEditor.selectedPath === path) {
                void fileEditor.openFile(path);
              }
              setTreeRefreshKey((k) => k + 1);
            }}
          />
        </Panel>
      </Group>

      <ContextBar
        contextInfo={chat.contextInfo}
        activeFile={activeChapterTitle}
        isDirty={chapter.hasDirtyActions}
        onFetchContextBlocks={async () => {
          const activeFile = (selectedMeta?.type === 'scene' && selectedMeta.sceneId)
            ? `${chapter.structureRoot ? chapter.structureRoot + '/' : ''}.project/chapter/${selectedMeta.chapterId}/${selectedMeta.sceneId}.json`
            : (fileEditor.selectedPath ?? null);
          const result = await chatApi.previewContext({
            message: '',
            activeFile,
            activeFieldKey: focusedField?.fieldKey ?? null,
            mode: selectedMode,
            referencedFiles: refs.referencedFiles,
            history: [],
            disabledToolkits: [...disabledToolkits],
          });
          return result.contextBlocks ?? [];
        }}
      />

      {credDialogOpen && (
        <GitCredentialsDialog
          onSuccess={() => {
            setCredDialogOpen(false);
            pendingRetry?.();
            setPendingRetry(null);
          }}
          onCancel={() => {
            setCredDialogOpen(false);
            setPendingRetry(null);
          }}
        />
      )}

      {settingsOpen && (
        <ProjectSettingsModal
          onClose={() => setSettingsOpen(false)}
          onModesChanged={loadModes}
          onGeneralConfigSaved={onProjectGeneralSaved}
          onWorkspacePluginsChanged={onWorkspacePluginsChanged}
        />
      )}

      <PromptPackModal
        open={promptPackOpen}
        onClose={() => setPromptPackOpen(false)}
        onGenerate={handlePromptPackGenerate}
        streaming={chat.streaming}
        hasPromptPackMode={modes.some(m => m.id === 'prompt-pack')}
      />

      {subprojectDialog && (
        <SubprojectTypeDialog
          folderPath={subprojectDialog.path}
          initialTypeId={subprojectDialog.initialType}
          onClose={() => setSubprojectDialog(null)}
          onSaved={() => {
            setTreeRefreshKey((k) => k + 1);
            setInlineChaptersNonce((n) => n + 1);
          }}
        />
      )}

      {fileHistoryPath && (
        <FileHistoryModal filePath={fileHistoryPath} onClose={() => setFileHistoryPath(null)} />
      )}

      {altVersionSession && (
        <AlternativeVersionPanel
          session={altVersionSession}
          onClose={() => setAltVersionSession(null)}
        />
      )}

      <QuickChatWindow
        open={quickChatOpen}
        onClose={() => setQuickChatOpen(false)}
        llms={llms}
        webSearchAvailable={webSearchAvailable}
        disabledToolkits={disabledToolkits}
      />

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportChatFile}
      />
    </div>
  );
}

export default App;
