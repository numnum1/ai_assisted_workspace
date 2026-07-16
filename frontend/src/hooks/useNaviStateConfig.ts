import { useCallback, useEffect, useState } from "react";
import { naviConfigApi } from "../electron/bridge.ts";
import type { NaviState } from "../naviStateMachine.ts";
import type { NaviTip } from "../naviTips.ts";

export interface UseNaviStateConfigResult {
  states: NaviState[];
  tips: NaviTip[];
  loading: boolean;
  error: string | null;
  saveStates: (next: NaviState[]) => Promise<boolean>;
  saveTips: (next: NaviTip[]) => Promise<boolean>;
  resetStates: () => Promise<NaviState[]>;
  resetTips: () => Promise<NaviTip[]>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Speichern fehlgeschlagen.";
}

/** Loads the effective (possibly user-edited) Navi state machine + tips, and exposes save/reset. */
export function useNaviStateConfig(): UseNaviStateConfigResult {
  const [states, setStates] = useState<NaviState[]>([]);
  const [tips, setTips] = useState<NaviTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedStates, loadedTips] = await Promise.all([
          naviConfigApi.getStates(),
          naviConfigApi.getTips(),
        ]);
        if (cancelled) return;
        setStates(loadedStates);
        setTips(loadedTips);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveStates = useCallback(async (next: NaviState[]): Promise<boolean> => {
    try {
      const saved = await naviConfigApi.setStates(next);
      setStates(saved);
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }, []);

  const saveTips = useCallback(async (next: NaviTip[]): Promise<boolean> => {
    try {
      const saved = await naviConfigApi.setTips(next);
      setTips(saved);
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }, []);

  const resetStates = useCallback(async (): Promise<NaviState[]> => {
    const reset = await naviConfigApi.resetStates();
    setStates(reset);
    setError(null);
    return reset;
  }, []);

  const resetTips = useCallback(async (): Promise<NaviTip[]> => {
    const reset = await naviConfigApi.resetTips();
    setTips(reset);
    setError(null);
    return reset;
  }, []);

  return { states, tips, loading, error, saveStates, saveTips, resetStates, resetTips };
}
