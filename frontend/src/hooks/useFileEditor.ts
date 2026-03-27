import { useState, useCallback, useEffect } from 'react';
import { filesApi, shadowApi } from '../api.ts';

export function useFileEditor(projectPath: string | null) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContentState] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shadow (meta-note) state
  const [shadowContent, setShadowContentState] = useState('');
  const [shadowDirty, setShadowDirty] = useState(false);
  const [shadowExists, setShadowExists] = useState(false);
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [shadowPanelOpen, setShadowPanelOpen] = useState(false);

  useEffect(() => {
    setSelectedPath(null);
    setContentState('');
    setDirty(false);
    setError(null);
    setShadowContentState('');
    setShadowDirty(false);
    setShadowExists(false);
    setShadowPanelOpen(false);
  }, [projectPath]);

  const loadShadow = useCallback(async (path: string) => {
    setShadowLoading(true);
    setShadowError(null);
    try {
      const res = await shadowApi.get(path);
      setShadowExists(res.exists);
      setShadowContentState(res.content);
      setShadowDirty(false);
    } catch (e) {
      setShadowError(e instanceof Error ? e.message : 'Meta-Notiz konnte nicht geladen werden');
    } finally {
      setShadowLoading(false);
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (path === selectedPath && !dirty) return;
      if (dirty) {
        if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
      }
      setLoading(true);
      setError(null);
      setSelectedPath(null);
      setContentState('');
      setShadowContentState('');
      setShadowDirty(false);
      setShadowExists(false);
      setShadowPanelOpen(false);
      try {
        const res = await filesApi.getContent(path);
        setSelectedPath(path);
        setContentState(res.content);
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Datei konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    },
    [selectedPath, dirty],
  );

  /** Opens a file and immediately shows the shadow (meta-note) panel. */
  const openFileMeta = useCallback(
    async (path: string) => {
      if (path === selectedPath && !dirty) {
        setShadowPanelOpen(true);
        await loadShadow(path);
        return;
      }
      if (dirty) {
        if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
      }
      setLoading(true);
      setError(null);
      setSelectedPath(null);
      setContentState('');
      setShadowContentState('');
      setShadowDirty(false);
      setShadowExists(false);
      try {
        const res = await filesApi.getContent(path);
        setSelectedPath(path);
        setContentState(res.content);
        setDirty(false);
        setShadowPanelOpen(true);
        await loadShadow(path);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Datei konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    },
    [selectedPath, dirty, loadShadow],
  );

  const openShadowPanel = useCallback(async () => {
    setShadowPanelOpen(true);
    if (selectedPath && !shadowExists && !shadowLoading && shadowContent === '') {
      await loadShadow(selectedPath);
    }
  }, [selectedPath, shadowExists, shadowLoading, shadowContent, loadShadow]);

  const closeShadowPanel = useCallback(() => {
    setShadowPanelOpen(false);
  }, []);

  const closeFile = useCallback(() => {
    if (!selectedPath) return;
    if (dirty || shadowDirty) {
      if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    setSelectedPath(null);
    setContentState('');
    setDirty(false);
    setError(null);
    setShadowContentState('');
    setShadowDirty(false);
    setShadowExists(false);
    setShadowPanelOpen(false);
    setShadowError(null);
  }, [selectedPath, dirty, shadowDirty]);

  const setContent = useCallback((next: string) => {
    setContentState(next);
    setDirty(true);
  }, []);

  const setShadowContent = useCallback((next: string) => {
    setShadowContentState(next);
    setShadowDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!selectedPath) return;
    setLoading(true);
    setError(null);
    try {
      await filesApi.saveContent(selectedPath, content);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [selectedPath, content]);

  const saveShadow = useCallback(async () => {
    if (!selectedPath) return;
    setShadowLoading(true);
    setShadowError(null);
    try {
      await shadowApi.save(selectedPath, shadowContent);
      setShadowDirty(false);
      setShadowExists(true);
    } catch (e) {
      setShadowError(e instanceof Error ? e.message : 'Meta-Notiz konnte nicht gespeichert werden');
    } finally {
      setShadowLoading(false);
    }
  }, [selectedPath, shadowContent]);

  const deleteShadow = useCallback(async () => {
    if (!selectedPath || !shadowExists) return;
    if (!window.confirm('Meta-Notiz löschen?')) return;
    setShadowLoading(true);
    setShadowError(null);
    try {
      await shadowApi.delete(selectedPath);
      setShadowExists(false);
      setShadowContentState('');
      setShadowDirty(false);
    } catch (e) {
      setShadowError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    } finally {
      setShadowLoading(false);
    }
  }, [selectedPath, shadowExists]);

  /** Keep editor path in sync when files are renamed or deleted from the tree */
  const syncWithFilesystem = useCallback(
    (event: { deleted?: string; renamed?: { from: string; to: string } }) => {
      if (event.deleted) {
        const p = event.deleted;
        if (selectedPath === p || (selectedPath != null && selectedPath.startsWith(`${p}/`))) {
          setSelectedPath(null);
          setContentState('');
          setDirty(false);
          setError(null);
          setShadowContentState('');
          setShadowDirty(false);
          setShadowExists(false);
          setShadowPanelOpen(false);
        }
      }
      if (event.renamed) {
        const { from, to } = event.renamed;
        if (!selectedPath) return;
        if (selectedPath === from) {
          setSelectedPath(to);
        } else if (selectedPath.startsWith(`${from}/`)) {
          setSelectedPath(to + selectedPath.slice(from.length));
        }
      }
    },
    [selectedPath],
  );

  return {
    selectedPath,
    content,
    dirty,
    loading,
    error,
    openFile,
    openFileMeta,
    closeFile,
    save,
    setContent,
    clearError: () => setError(null),
    syncWithFilesystem,
    // Shadow
    shadowContent,
    shadowDirty,
    shadowExists,
    shadowLoading,
    shadowError,
    shadowPanelOpen,
    setShadowContent,
    saveShadow,
    deleteShadow,
    openShadowPanel,
    closeShadowPanel,
    clearShadowError: () => setShadowError(null),
  };
}
