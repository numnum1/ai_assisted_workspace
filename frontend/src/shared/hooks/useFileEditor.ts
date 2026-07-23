import { useState, useCallback, useEffect } from 'react';
import { filesApi } from '../api.ts';

export function useFileEditor(projectPath: string | null) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContentState] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath(null);
    setContentState('');
    setDirty(false);
    setError(null);
  }, [projectPath]);

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

  const closeFile = useCallback(() => {
    if (!selectedPath) return;
    if (dirty) {
      if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    setSelectedPath(null);
    setContentState('');
    setDirty(false);
    setError(null);
  }, [selectedPath, dirty]);

  const setContent = useCallback((next: string) => {
    setContentState(next);
    setDirty(true);
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
    closeFile,
    save,
    setContent,
    clearError: () => setError(null),
    syncWithFilesystem,
  };
}
