import { useCallback, useEffect, useState } from "react";
import { naviConfigApi } from "../electron/bridge.ts";
import type { NaviState } from "../naviStateMachine.ts";
import type { NaviTip } from "../naviTips.ts";
import type { NaviPersonaConfig } from "../naviPersona.ts";
import type { NaviUseCase } from "../naviUseCases.ts";
import type { NaviTool } from "../naviTools.ts";

export interface UseNaviStateConfigResult {
  states: NaviState[];
  tips: NaviTip[];
  persona: NaviPersonaConfig | null;
  useCases: NaviUseCase[];
  tools: NaviTool[];
  loading: boolean;
  error: string | null;
  saveStates: (next: NaviState[]) => Promise<boolean>;
  saveTips: (next: NaviTip[]) => Promise<boolean>;
  savePersona: (next: NaviPersonaConfig) => Promise<boolean>;
  saveUseCases: (next: NaviUseCase[]) => Promise<boolean>;
  saveTools: (next: NaviTool[]) => Promise<boolean>;
  resetStates: () => Promise<NaviState[]>;
  resetTips: () => Promise<NaviTip[]>;
  resetPersona: () => Promise<NaviPersonaConfig>;
  resetUseCases: () => Promise<NaviUseCase[]>;
  resetTools: () => Promise<NaviTool[]>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Speichern fehlgeschlagen.";
}

/**
 * Loads the effective (possibly user-edited) Navi configuration — state machine, tips,
 * persona rules, and the use-case/tool knowledge base — and exposes save/reset for each.
 */
export function useNaviStateConfig(): UseNaviStateConfigResult {
  const [states, setStates] = useState<NaviState[]>([]);
  const [tips, setTips] = useState<NaviTip[]>([]);
  const [persona, setPersona] = useState<NaviPersonaConfig | null>(null);
  const [useCases, setUseCases] = useState<NaviUseCase[]>([]);
  const [tools, setTools] = useState<NaviTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedStates, loadedTips, loadedPersona, loadedUseCases, loadedTools] = await Promise.all([
          naviConfigApi.getStates(),
          naviConfigApi.getTips(),
          naviConfigApi.getPersona(),
          naviConfigApi.getUseCases(),
          naviConfigApi.getTools(),
        ]);
        if (cancelled) return;
        setStates(loadedStates);
        setTips(loadedTips);
        setPersona(loadedPersona);
        setUseCases(loadedUseCases);
        setTools(loadedTools);
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

  const savePersona = useCallback(async (next: NaviPersonaConfig): Promise<boolean> => {
    try {
      const saved = await naviConfigApi.setPersona(next);
      setPersona(saved);
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }, []);

  const saveUseCases = useCallback(async (next: NaviUseCase[]): Promise<boolean> => {
    try {
      const saved = await naviConfigApi.setUseCases(next);
      setUseCases(saved);
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }, []);

  const saveTools = useCallback(async (next: NaviTool[]): Promise<boolean> => {
    try {
      const saved = await naviConfigApi.setTools(next);
      setTools(saved);
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

  const resetPersona = useCallback(async (): Promise<NaviPersonaConfig> => {
    const reset = await naviConfigApi.resetPersona();
    setPersona(reset);
    setError(null);
    return reset;
  }, []);

  const resetUseCases = useCallback(async (): Promise<NaviUseCase[]> => {
    const reset = await naviConfigApi.resetUseCases();
    setUseCases(reset);
    setError(null);
    return reset;
  }, []);

  const resetTools = useCallback(async (): Promise<NaviTool[]> => {
    const reset = await naviConfigApi.resetTools();
    setTools(reset);
    setError(null);
    return reset;
  }, []);

  return {
    states,
    tips,
    persona,
    useCases,
    tools,
    loading,
    error,
    saveStates,
    saveTips,
    savePersona,
    saveUseCases,
    saveTools,
    resetStates,
    resetTips,
    resetPersona,
    resetUseCases,
    resetTools,
  };
}
