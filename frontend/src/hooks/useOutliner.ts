import { useState, useEffect, useCallback } from 'react';
import { outlinerApi } from '../api.ts';
import type { OutlinerTree } from '../types.ts';

interface UseOutlinerResult {
  tree: OutlinerTree | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createChapter: (name: string) => Promise<string>;
  createScene: (chapterPath: string, name: string, withMetadata: boolean) => Promise<{ textPath: string; metaPath: string }>;
}

export function useOutliner(): UseOutlinerResult {
  const [tree, setTree] = useState<OutlinerTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    outlinerApi.getTree()
      .then(setTree)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createChapter = useCallback(async (name: string): Promise<string> => {
    const result = await outlinerApi.createChapter(name);
    refresh();
    return result.path;
  }, [refresh]);

  const createScene = useCallback(
    async (chapterPath: string, name: string, withMetadata: boolean) => {
      const result = await outlinerApi.createScene(chapterPath, name, withMetadata);
      refresh();
      return { textPath: result.textPath, metaPath: result.metaPath };
    },
    [refresh]
  );

  return { tree, loading, error, refresh, createChapter, createScene };
}
