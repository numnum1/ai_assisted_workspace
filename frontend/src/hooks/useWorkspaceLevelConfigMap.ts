import { useState, useEffect } from 'react';
import { projectConfigApi } from '../api.ts';
import type { OutlinerLevelConfig } from '../types.ts';
import { buildOutlinerLevelConfig } from '../meta/outlinerLabels.ts';

const FALLBACK = buildOutlinerLevelConfig(null);

/**
 * Loads workspace mode YAMLs when the project opens (or refreshNonce bumps) and maps mode id → outliner labels/icons.
 */
export function useWorkspaceLevelConfigMap(
  projectPath: string | null,
  refreshNonce: number = 0,
): Record<string, OutlinerLevelConfig> {
  const [map, setMap] = useState<Record<string, OutlinerLevelConfig>>({});

  useEffect(() => {
    if (!projectPath) {
      setMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const modes = await projectConfigApi.listWorkspaceModes();
        const entries = await Promise.all(
          modes.map(async (m) => {
            try {
              const s = await projectConfigApi.getWorkspaceMode(m.id);
              return [m.id, buildOutlinerLevelConfig(s)] as const;
            } catch {
              return [m.id, FALLBACK] as const;
            }
          }),
        );
        if (!cancelled) setMap(Object.fromEntries(entries));
      } catch {
        if (!cancelled) setMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath, refreshNonce]);

  return map;
}

export function resolveLevelConfig(
  map: Record<string, OutlinerLevelConfig>,
  modeId: string | null | undefined,
): OutlinerLevelConfig {
  const id = modeId?.trim() || 'default';
  return map[id] ?? FALLBACK;
}
