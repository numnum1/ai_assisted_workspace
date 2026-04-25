import { useState, useEffect, useCallback } from "react";
import type { AppPreferences } from "../types.ts";
import { preferencesApi } from "../electron/bridge.ts";

export interface UsePreferencesResult {
  preferences: AppPreferences;
  loaded: boolean;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
}

const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  appearance: {
    fontFamily: "system-ui",
    chatFontSizePx: 14,
    theme: "dark",
  },
};

export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] =
    useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    preferencesApi
      .get()
      .then((prefs) => {
        setPreferences(prefs);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<AppPreferences>) => {
      const updated = await preferencesApi.set(patch);
      setPreferences(updated);
    },
    [],
  );

  return { preferences, loaded, updatePreferences };
}
