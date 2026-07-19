import { usePreferences } from "../../shared/hooks/usePreferences.ts";
import { useAppearanceCss } from "../../shared/hooks/useAppearanceCss.ts";
import { ProjectSettingsModal } from "../book/components/settings/ProjectSettingsModal.tsx";

/**
 * Root of the standalone Einstellungen window (loaded with `?window=settings`).
 * The bridge and IPC are shared with the main window; the open project comes
 * from the main-process singleton, resolved inside {@link ProjectSettingsModal}
 * via `projectConfigApi`. Saves broadcast `workspace:changed` (reason
 * "settings") so the Buch window can refresh its own mode/config cache instead
 * of being wired through direct callback props.
 */
export function SettingsWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  return <ProjectSettingsModal variant="window" onClose={() => window.close()} />;
}
