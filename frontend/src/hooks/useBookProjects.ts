import { useEffect, useState } from 'react';
import { filesApi } from '../api.ts';
import { collectBookProjects, type BookProject } from '../utils/bookProjects.ts';

/** Lists the root project plus every book-like subproject, for project pickers. */
export function useBookProjects(projectPath: string | null) {
  const [projects, setProjects] = useState<BookProject[]>([]);

  useEffect(() => {
    if (!projectPath) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    filesApi
      .getTree()
      .then(tree => {
        if (!cancelled) setProjects(collectBookProjects(tree));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return projects;
}
