import { useState, useCallback, useEffect } from 'react';
import type { FileNode } from '../types.ts';
import { filesApi, projectApi } from '../api.ts';

export function useProject() {
  const [projectPath, setProjectPath] = useState<string>('');
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileLines, setFileLines] = useState<number>(0);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refreshTree = useCallback(async () => {
    try {
      const tree = await filesApi.getTree();
      setFileTree(tree);
    } catch (err) {
      console.error('Failed to load file tree:', err);
      setFileTree(null);
    }
  }, []);

  useEffect(() => {
    projectApi.current().then((info) => {
      setProjectPath(info.path);
      setInitialized(info.initialized ?? false);
      if (info.hasProject) {
        refreshTree();
      }
    }).catch(console.error);
  }, [refreshTree]);

  const openProject = useCallback(async (path: string) => {
    const result = await projectApi.open(path);
    setProjectPath(result.path);
    setFileTree(result.tree);
    setInitialized(result.initialized ?? false);
    setOpenFilePath(null);
    setFileContent('');
    setFileLines(0);
    setIsDirty(false);
  }, []);

  const openFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const data = await filesApi.getContent(path);
      setOpenFilePath(data.path);
      setFileContent(data.content);
      setFileLines(data.lines);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to open file:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateContent = useCallback((content: string) => {
    setFileContent(content);
    setIsDirty(true);
  }, []);

  const saveFile = useCallback(async () => {
    if (!openFilePath || !isDirty) return;
    try {
      await filesApi.saveContent(openFilePath, fileContent);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [openFilePath, fileContent, isDirty]);

  return {
    projectPath,
    fileTree,
    openFilePath,
    fileContent,
    fileLines,
    isDirty,
    loading,
    initialized,
    refreshTree,
    openProject,
    openFile,
    updateContent,
    saveFile,
  };
}
