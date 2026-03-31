import { useState, useCallback, useEffect } from 'react';
import { projectApi } from '../api.ts';

export function useProject() {
  const [projectPath, setProjectPath] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    projectApi.current().then((info) => {
      setProjectPath(info.path);
      setInitialized(info.initialized ?? false);
    }).catch(console.error);
  }, []);

  const openProject = useCallback(async (path: string) => {
    const result = await projectApi.open(path);
    setProjectPath(result.path);
    setInitialized(result.initialized ?? false);
  }, []);

  return {
    projectPath,
    initialized,
    openProject,
  };
}
