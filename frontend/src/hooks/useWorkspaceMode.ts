import { useState, useEffect, useMemo, useCallback } from 'react';
import { projectConfigApi } from '../api.ts';
import type { MetaNodeType, WorkspaceModeSchema } from '../types.ts';
import type { MetaTypeSchema } from '../meta/metaSchema.ts';
import { buildMetaSchemasFromWorkspace, defaultMetaSchemas } from '../meta/workspaceMeta.ts';
import { buildOutlinerLevelConfig } from '../meta/outlinerLabels.ts';
import type { OutlinerLevelConfig } from '../types.ts';

export interface UseWorkspaceModeResult {
  schema: WorkspaceModeSchema | null;
  metaSchemas: Record<MetaNodeType, MetaTypeSchema>;
  levelConfig: OutlinerLevelConfig;
  refresh: () => Promise<void>;
}

/**
 * @param modeId Workspace mode YAML id (e.g. default, book). Root project browser uses "default".
 */
export function useWorkspaceMode(projectPath: string, modeId: string): UseWorkspaceModeResult {
  const [schema, setSchema] = useState<WorkspaceModeSchema | null>(null);

  const refresh = useCallback(async () => {
    try {
      const id = modeId?.trim() || 'default';
      const s = await projectConfigApi.getWorkspaceMode(id);
      setSchema(s);
    } catch (e) {
      console.error(e);
      setSchema(null);
    }
  }, [modeId]);

  useEffect(() => {
    if (!projectPath) {
      setSchema(null);
      return;
    }
    void refresh();
  }, [projectPath, modeId, refresh]);

  const metaSchemas = useMemo((): Record<MetaNodeType, MetaTypeSchema> => {
    if (!schema) return defaultMetaSchemas;
    return buildMetaSchemasFromWorkspace(schema);
  }, [schema]);

  const levelConfig = useMemo(() => buildOutlinerLevelConfig(schema), [schema]);

  return { schema, metaSchemas, levelConfig, refresh };
}
