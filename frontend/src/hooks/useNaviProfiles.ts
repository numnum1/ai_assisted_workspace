import { useCallback, useEffect, useState } from "react";
import { naviConfigApi } from "../electron/bridge.ts";
import {
  NAVI_BUILTIN_PROFILE_ID,
  isBuiltInProfile,
  type NaviProfileIndex,
  type NaviProfileMeta,
} from "../naviProfile.ts";

export interface UseNaviProfilesResult {
  profiles: NaviProfileMeta[];
  activeProfileId: string;
  activeProfile: NaviProfileMeta | null;
  /** True while the read-only built-in profile is active — saving forks instead of writing. */
  activeIsBuiltIn: boolean;
  loading: boolean;
  error: string | null;
  selectProfile: (id: string) => Promise<void>;
  /** Creates a profile seeded from `fromId` (default: the active one) and activates it. Returns its id. */
  createProfile: (name: string, fromId?: string) => Promise<string | null>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  exportProfile: (id: string) => Promise<string | null>;
  importProfile: () => Promise<string | null>;
  clearError: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Aktion fehlgeschlagen.";
}

/**
 * The profile list plus the currently selected profile. Every Navi config read/write in the app
 * is implicitly scoped to the active profile by the main process, so switching here is what makes
 * `useNaviStateConfig` reload a different configuration.
 */
export function useNaviProfiles(): UseNaviProfilesResult {
  const [profiles, setProfiles] = useState<NaviProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>(NAVI_BUILTIN_PROFILE_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((index: NaviProfileIndex) => {
    setProfiles(index.profiles);
    setActiveProfileId(index.activeProfileId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await naviConfigApi.listProfiles();
        if (!cancelled) apply(index);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const selectProfile = useCallback(
    async (id: string) => {
      try {
        apply(await naviConfigApi.setActiveProfile(id));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [apply],
  );

  const createProfile = useCallback(
    async (name: string, fromId?: string): Promise<string | null> => {
      try {
        const index = await naviConfigApi.createProfile(name, fromId);
        apply(index);
        setError(null);
        return index.activeProfileId;
      } catch (err) {
        setError(errorMessage(err));
        return null;
      }
    },
    [apply],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      try {
        apply(await naviConfigApi.renameProfile(id, name));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [apply],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      try {
        apply(await naviConfigApi.deleteProfile(id));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [apply],
  );

  const exportProfile = useCallback(async (id: string): Promise<string | null> => {
    try {
      const result = await naviConfigApi.exportProfile(id);
      setError(null);
      return result.cancelled ? null : (result.fileName ?? null);
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, []);

  const importProfile = useCallback(async (): Promise<string | null> => {
    try {
      const result = await naviConfigApi.importProfile();
      if (result.cancelled) return null;
      if (result.profiles) apply(result.profiles);
      setError(null);
      return result.fileName ?? null;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, [apply]);

  return {
    profiles,
    activeProfileId,
    activeProfile: profiles.find((p) => p.id === activeProfileId) ?? null,
    activeIsBuiltIn: isBuiltInProfile(activeProfileId),
    loading,
    error,
    selectProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    exportProfile,
    importProfile,
    clearError: () => setError(null),
  };
}
