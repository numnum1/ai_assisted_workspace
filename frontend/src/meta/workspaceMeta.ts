import type { MetaNodeType } from '../types.ts';
import type { MetaFieldDef, MetaTypeSchema } from './metaSchema.ts';
import type { WorkspaceMetaFieldDef, WorkspaceMetaTypeSchema, WorkspaceModeSchema } from '../types.ts';
import { buchSchema } from './buchSchema.ts';
import { kapitelSchema } from './kapitelSchema.ts';
import { szeneSchema } from './szeneSchema.ts';
import { aktSchema } from './aktSchema.ts';

/** Static book defaults when API has not loaded yet */
export const defaultMetaSchemas: Record<MetaNodeType, MetaTypeSchema> = {
  book: buchSchema,
  chapter: kapitelSchema,
  scene: szeneSchema,
  action: aktSchema,
};

function mapField(f: WorkspaceMetaFieldDef): MetaFieldDef {
  const out: MetaFieldDef = {
    key: f.key,
    label: f.label,
    type: f.type,
    defaultValue: f.defaultValue ?? '',
  };
  if (f.placeholder != null && f.placeholder !== '') out.placeholder = f.placeholder;
  if (f.options != null && f.options.length > 0) out.options = f.options;
  return out;
}

function mapSchema(s: WorkspaceMetaTypeSchema | undefined, fallback: MetaTypeSchema): MetaTypeSchema {
  if (!s?.fields?.length) return fallback;
  return {
    filename: s.filename || fallback.filename,
    fields: s.fields.map(mapField),
  };
}

/**
 * Maps server workspace mode YAML to the four MetaPanel node types.
 * Keys in API: root, chapter, scene, action.
 */
export function buildMetaSchemasFromWorkspace(ws: WorkspaceModeSchema): Record<MetaNodeType, MetaTypeSchema> {
  const m = ws.metaSchemas ?? {};
  return {
    book: mapSchema(m.root, defaultMetaSchemas.book),
    chapter: mapSchema(m.chapter, defaultMetaSchemas.chapter),
    scene: mapSchema(m.scene, defaultMetaSchemas.scene),
    action: mapSchema(m.action, defaultMetaSchemas.action),
  };
}
