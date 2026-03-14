import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen, ArrowDown, ArrowUp, Check, GitCommitHorizontal, RefreshCw, Settings } from 'lucide-react';
import { WritingEditor } from './components/WritingEditor.tsx';
import { ContextPanel } from './components/ContextPanel.tsx';
import { MetafileEditor } from './components/MetafileEditor.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { FileHistoryModal } from './components/FileHistoryModal.tsx';
import { GitCredentialsDialog } from './components/GitCredentialsDialog.tsx';
import { ProjectSettingsModal } from './components/ProjectSettingsModal.tsx';
import { ContentBrowser } from './components/ContentBrowser.tsx';
import { MetafileTypeDialog } from './components/MetafileTypeDialog.tsx';
import { PlanningPanel } from './components/PlanningPanel.tsx';
import { GlossaryPanel } from './components/GlossaryPanel.tsx';
import type { MetafileType } from './components/MetafileTypeDialog.tsx';
import type { CommandAction } from './components/CommandPalette.tsx';
import type { GitStatus, GitSyncStatus } from './types.ts';
import { gitApi, projectConfigApi, filesApi, AuthRequiredError } from './api.ts';
import { BookOpen } from 'lucide-react';
import { useProject } from './hooks/useProject.ts';
import { useActiveScene } from './hooks/useActiveScene.ts';
import { getBookmark } from './components/bookmarkExtension';

function App() {
  const project = useProject();

  // ── Active scene tracking ─────────────────────────────────────────────────
  const { activeSceneId, activeMetafilePath, setActiveSceneId } = useActiveScene(project.openFilePath);

  // ── Git ───────────────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyFile, setHistoryFile] = useState<string | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);

  // ── Planning ──────────────────────────────────────────────────────────────
  const [planningRefresh, setPlanningRefresh] = useState(0);
  const [pendingMetafilePath, setPendingMetafilePath] = useState<string | null>(null);

  // ── Meta editor (bottom-left) ─────────────────────────────────────────────
  const [selectedMetafilePath, setSelectedMetafilePath] = useState<string | null>(null);
  const [metaContent, setMetaContent] = useState('');
  const [metaDirty, setMetaDirty] = useState(false);
  const metaDirtyRef = useRef(false);
  const metaContentRef = useRef('');
  const metaPathRef = useRef<string | null>(null);

  metaDirtyRef.current = metaDirty;
  metaContentRef.current = metaContent;

  useEffect(() => {
    const prev = metaPathRef.current;
    if (prev && metaDirtyRef.current) {
      filesApi.saveContent(prev, metaContentRef.current).catch(console.error);
    }
    metaPathRef.current = selectedMetafilePath;

    if (!selectedMetafilePath) {
      setMetaContent('');
      setMetaDirty(false);
      return;
    }
    filesApi.getContent(selectedMetafilePath)
      .then(data => { setMetaContent(data.content); setMetaDirty(false); })
      .catch(() => { setMetaContent(''); setMetaDirty(false); });
  }, [selectedMetafilePath]);

  const handleMetaChange = useCallback((content: string) => {
    setMetaContent(content);
    setMetaDirty(true);
  }, []);

  const handleMetaSave = useCallback(async () => {
    if (!selectedMetafilePath || !metaDirtyRef.current) return;
    try {
      await filesApi.saveContent(selectedMetafilePath, metaContentRef.current);
      setMetaDirty(false);
      setPlanningRefresh(r => r + 1);
    } catch (err) {
      console.error('Failed to save metafile:', err);
    }
  }, [selectedMetafilePath]);

  const handleMetaOpenSource = useCallback(() => {
    if (selectedMetafilePath) project.openFile(selectedMetafilePath);
  }, [selectedMetafilePath, project]);

  // ── Bookmark ──────────────────────────────────────────────────────────────
  const [bookmarkJumpTarget, setBookmarkJumpTarget] = useState<{ filePath: string; line: number } | null>(null);

  const bookmark = project.projectPath ? getBookmark(project.projectPath) : null;

  const handleJumpToBookmark = useCallback(() => {
    if (!bookmark) return;
    project.openFile(bookmark.filePath);
    setBookmarkJumpTarget(bookmark);
  }, [bookmark, project]);

  const handleBookmarkJumpDone = useCallback(() => {
    setBookmarkJumpTarget(null);
  }, []);

  // ── Features ──────────────────────────────────────────────────────────────
  const loadFeatures = useCallback(() => {
    projectConfigApi.get().then(cfg => setFeatures(cfg.features ?? [])).catch(() => setFeatures([]));
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  const hasWiki = features.includes('wiki');
  const hasGlossary = features.includes('glossary');

  // ── Git state ─────────────────────────────────────────────────────────────
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

  useEffect(() => {
    fetchGitState();
    const interval = setInterval(fetchGitState, 30_000);
    return () => clearInterval(interval);
  }, [fetchGitState]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setWikiOpen(false);
        setGlossaryOpen(false);
      }
      if (e.shiftKey && e.key === ' ' && !e.ctrlKey && !e.altKey) {
        if (hasWiki) {
          e.preventDefault();
          e.stopPropagation();
          setWikiOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [hasWiki]);

  // ── Git badge ─────────────────────────────────────────────────────────────
  const hasUncommitted = !gitStatus?.isClean;

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

  // ── Command palette ───────────────────────────────────────────────────────
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
    if (hasGlossary) {
      actions.push({
        id: 'open-glossary',
        label: 'Open Glossar',
        icon: <BookOpen size={16} />,
        handler: () => { setPaletteOpen(false); setGlossaryOpen(true); },
      });
    }
    return actions;
  }, [hasUncommitted, syncBadge, hasGlossary]);

  // ── Project open ──────────────────────────────────────────────────────────
  const handleOpenProject = useCallback(async (path: string) => {
    await project.openProject(path);
    loadFeatures();
  }, [project, loadFeatures]);

  // ── Metafile creation ─────────────────────────────────────────────────────
  const makeMetafileTemplate = (sourcePath: string, type: MetafileType): string => {
    const id = sourcePath.replace(/^.*\//, '').replace(/\.md$/, '');
    const bodies: Record<MetafileType, string> = {
      book: [
        `id: ${id}`,
        `name: ""`,
        `universum: ""`,
        `zeitliche_einordnung: ""`,
        `beschreibung: ""`,
      ].join('\n') + '\n',
      chapter: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
      scene: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
      action: [
        `id: ${id}`,
        `title: ""`,
        `status: draft`,
        `ort: ""`,
        `character: ""`,
        `was_passiert: ""`,
        `ziel: ""`,
      ].join('\n') + '\n',
      arc: [
        `id: ${id}`,
        `title: ""`,
        `thema: ""`,
        `zusammenfassung: ""`,
      ].join('\n') + '\n',
    };
    return `---\ntype: ${type}\n${bodies[type]}---\n`;
  };

  const handleMetafileTypeSelected = useCallback(async (type: MetafileType) => {
    if (!pendingMetafilePath) return;
    const isStandalone = pendingMetafilePath.startsWith('.planning/');
    const metaPath = isStandalone ? pendingMetafilePath : `.planning/${pendingMetafilePath}`;
    const idSource = isStandalone
      ? pendingMetafilePath.split('/').pop()?.replace(/\.md$/, '') ?? ''
      : pendingMetafilePath;
    setPendingMetafilePath(null);
    try {
      await filesApi.saveContent(metaPath, makeMetafileTemplate(idSource, type));
      setPlanningRefresh(r => r + 1);
    } catch (err) {
      console.error('Failed to create metafile:', err);
    }
  }, [pendingMetafilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const VALID_CHILD_TYPES: MetafileType[] = ['chapter', 'scene', 'action'];

  const handleCreateStandaloneMetafile = useCallback((folder: string, suggestedType?: string) => {
    const name = window.prompt('Name des Metafiles (ohne .md):');
    if (!name || !name.trim()) return;
    const safeName = name.trim().replace(/\.md$/, '') + '.md';
    const targetPath = `${folder}/${safeName}`;

    const lower = suggestedType?.toLowerCase();
    const inferredType = lower && VALID_CHILD_TYPES.includes(lower as MetafileType)
      ? (lower as MetafileType)
      : undefined;
    if (inferredType) {
      const idSource = safeName.replace(/\.md$/, '');
      filesApi.saveContent(targetPath, makeMetafileTemplate(idSource, inferredType))
        .then(() => setPlanningRefresh(r => r + 1))
        .catch(err => console.error('Failed to create metafile:', err));
    } else {
      setPendingMetafilePath(targetPath);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metafile deletion ─────────────────────────────────────────────────────
  const handleDeleteMetafile = useCallback(async (path: string, hasChildren: boolean) => {
    const name = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
    const msg = hasChildren
      ? `"${name}" und alle Untereinträge wirklich löschen?`
      : `"${name}" wirklich löschen?`;
    if (!window.confirm(msg)) return;
    try {
      if (hasChildren) {
        const folderPath = path.replace(/\.md$/, '');
        await project.deleteFile(folderPath);
      }
      await project.deleteFile(path);
      setPlanningRefresh(r => r + 1);
      fetchGitState();
    } catch (err) {
      console.error('Delete metafile failed:', err);
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }, [project, fetchGitState]);

  // ── Chapter navigation ────────────────────────────────────────────────────
  const handleOpenChapter = useCallback(async (textFilePath: string) => {
    try {
      // Check if the text file exists before opening
      await filesApi.getContent(textFilePath);
      project.openFile(textFilePath);
    } catch {
      // Text file doesn't exist yet — create it and open it
      try {
        await filesApi.saveContent(textFilePath, '');
        await project.refreshTree();
        project.openFile(textFilePath);
      } catch (err) {
        console.error('Failed to create chapter text file:', err);
      }
    }
  }, [project]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={commandActions}
        onOpenFolder={handleOpenProject}
        onGitRefresh={fetchGitState}
        gitStatus={gitStatus ?? undefined}
        onAuthRequired={showCredentialsDialog}
      />

      <Group orientation="horizontal" className="app-panels">
        <Panel defaultSize="18%" minSize="10%" maxSize="40%">
          <Group orientation="vertical" style={{ height: '100%' }}>
            <Panel minSize={20}>
              <PlanningPanel
                activeChapterPath={project.openFilePath}
                activeSceneId={activeSceneId}
                onOpenChapter={handleOpenChapter}
                onCreateMetafile={handleCreateStandaloneMetafile}
                onDeleteMetafile={handleDeleteMetafile}
                onSelectMetafile={setSelectedMetafilePath}
                refreshTrigger={planningRefresh}
              />
            </Panel>
            {selectedMetafilePath && (
              <>
                <Separator className="resize-handle-h" />
                <Panel defaultSize={40} minSize={15}>
                  <MetafileEditor
                    content={metaContent}
                    filePath={selectedMetafilePath}
                    isDirty={metaDirty}
                    onChange={handleMetaChange}
                    onSave={handleMetaSave}
                    onOpenSourceFile={handleMetaOpenSource}
                  />
                </Panel>
              </>
            )}
          </Group>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="52%" minSize="20%">
          <WritingEditor
            content={project.fileContent}
            filePath={project.openFilePath}
            projectPath={project.projectPath}
            bookmarkJumpTarget={bookmarkJumpTarget}
            onBookmarkJumpDone={handleBookmarkJumpDone}
            isDirty={project.isDirty}
            onChange={project.updateContent}
            onSave={async () => { await project.saveFile(); fetchGitState(); }}
            onActiveSceneChange={setActiveSceneId}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="30%" minSize="15%" maxSize="50%">
          <ContextPanel activeMetafilePath={activeMetafilePath} />
        </Panel>
      </Group>

      {wikiOpen && hasWiki && (
        <ContentBrowser
          onOpenFile={(path) => { project.openFile(path); setWikiOpen(false); }}
          onClose={() => setWikiOpen(false)}
        />
      )}

      {glossaryOpen && hasGlossary && (
        <GlossaryPanel
          onOpenFile={(path) => { project.openFile(path); }}
          onClose={() => setGlossaryOpen(false)}
        />
      )}

      {historyFile && (
        <FileHistoryModal
          filePath={historyFile}
          onClose={() => setHistoryFile(null)}
        />
      )}

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
          onClose={() => { setSettingsOpen(false); loadFeatures(); }}
          onModesChanged={() => {}}
        />
      )}

      {pendingMetafilePath && (
        <MetafileTypeDialog
          onSelect={handleMetafileTypeSelected}
          onCancel={() => setPendingMetafilePath(null)}
          allowedTypes={
            pendingMetafilePath.startsWith('.planning/') &&
            !pendingMetafilePath.replace(/^\.planning\//, '').includes('/')
              ? ['book', 'arc']
              : undefined
          }
        />
      )}
    </div>
  );
}

export default App;
