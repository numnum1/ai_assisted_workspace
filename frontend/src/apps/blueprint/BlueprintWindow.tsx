import { useEffect, useState } from "react";
import { windowApi } from "../../shared/api.ts";
import { usePreferences } from "../../shared/hooks/usePreferences.ts";
import { useAppearanceCss } from "../../shared/hooks/useAppearanceCss.ts";
import { BlueprintCanvas } from "./BlueprintCanvas.tsx";

/**
 * Root of the standalone Blueprint window (loaded with `?window=blueprint`).
 * The bridge and IPC are shared with the main window; the open project comes
 * from the main-process singleton. On a project switch we remount the canvas so
 * it re-reads the new project's graph.
 */
export function BlueprintWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    return windowApi.onWorkspaceChanged((payload) => {
      if (
        payload &&
        typeof payload === "object" &&
        (payload as { reason?: string }).reason === "project"
      ) {
        setReloadKey((k) => k + 1);
      }
    });
  }, []);

  return <BlueprintCanvas key={reloadKey} />;
}
