import { usePreferences } from "../../shared/hooks/usePreferences.ts";
import { useAppearanceCss } from "../../shared/hooks/useAppearanceCss.ts";
import { EventsApp } from "./EventsApp.tsx";

/**
 * Root of the standalone Ereignisse window (loaded with `?window=events`).
 * The bridge and IPC are shared with the main window; the open project comes
 * from the main-process singleton, resolved inside {@link EventsApp}. Applies
 * the user's appearance/theme so the window matches the rest of the app.
 */
export function EventsWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  return <EventsApp />;
}
