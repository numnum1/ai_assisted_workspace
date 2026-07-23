import { useEffect, useState } from "react";
import { projectApi } from "../../shared/api.ts";
import { usePreferences } from "../../shared/hooks/usePreferences.ts";
import { useAppearanceCss } from "../../shared/hooks/useAppearanceCss.ts";
import { WikiTree } from "./WikiTree.tsx";

/**
 * Root of the standalone Wiki window (loaded with `?window=wiki`). A plain
 * folder/file outliner scoped to the project's `wiki/` directory; the bridge
 * and open project come from the main-process singleton, same as Pinnwand.
 * Double-clicking an entry opens it in its own Wiki-Eintrag window rather than
 * embedding an editor here.
 */
export function WikiWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  const [projectPath, setProjectPath] = useState<string | null>(null);
  useEffect(() => {
    projectApi
      .current()
      .then((p) => setProjectPath(p.hasProject ? p.path : null))
      .catch(() => setProjectPath(null));
  }, []);

  return <WikiTree projectPath={projectPath} />;
}
