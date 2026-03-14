import { useState, useEffect, useMemo } from 'react';

/**
 * Tracks the active scene within a chapter and derives the corresponding
 * metafile path for display in the ContextPanel.
 *
 * Convention: chapter text file "buch/kapitel-01.md" has scene metafiles at
 * ".planning/buch/kapitel-01/szene-02.md" etc.
 */
export function useActiveScene(chapterPath: string | null) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  // Reset active scene whenever the chapter changes
  useEffect(() => {
    setActiveSceneId(null);
  }, [chapterPath]);

  const activeMetafilePath = useMemo(() => {
    if (!chapterPath || !activeSceneId) return null;
    const withoutExt = chapterPath.replace(/\.md$/, '');
    return `.planning/${withoutExt}/${activeSceneId}.md`;
  }, [chapterPath, activeSceneId]);

  return { activeSceneId, activeMetafilePath, setActiveSceneId };
}
