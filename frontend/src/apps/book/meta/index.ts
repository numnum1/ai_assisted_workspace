import { defaultMetaSchemas, buildMetaSchemasFromWorkspace } from './workspaceMeta.ts';
import { buildOutlinerLevelConfig } from './outlinerLabels.ts';

/** @deprecated Prefer useWorkspaceMode().metaSchemas — kept for rare static imports */
export const metaSchemas = defaultMetaSchemas;

export { defaultMetaSchemas, buildMetaSchemasFromWorkspace, buildOutlinerLevelConfig };

export type { MetaFieldDef, MetaTypeSchema } from './metaSchema.ts';
