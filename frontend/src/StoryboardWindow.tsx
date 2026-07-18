import { useEffect, useState } from "react";
import { projectApi } from "./api.ts";
import { usePreferences } from "./hooks/usePreferences.ts";
import { useAppearanceCss } from "./hooks/useAppearanceCss.ts";
import { StoryboardCanvas } from "./components/storyboard/StoryboardCanvas.tsx";

/**
 * Root of the standalone Pinnwand window (loaded with `?window=storyboard`).
 * The bridge and IPC are shared with the main window; the open project comes
 * from the main-process singleton, so we only need the path to drive the
 * book-filter. Applies the user's appearance/theme so the window matches.
 */
export function StoryboardWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  const [projectPath, setProjectPath] = useState<string | null>(null);
  useEffect(() => {
    projectApi
      .current()
      .then((p) => setProjectPath(p.hasProject ? p.path : null))
      .catch(() => setProjectPath(null));
  }, []);

  return (
    <StoryboardCanvas
      open
      variant="window"
      projectPath={projectPath}
      onClose={() => window.close()}
    />
  );
}
