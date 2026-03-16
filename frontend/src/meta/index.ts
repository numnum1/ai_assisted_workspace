import type { MetaNodeType } from '../types.ts';
import type { MetaTypeSchema } from './metaSchema.ts';
import { kapitelSchema } from './kapitelSchema.ts';
import { szeneSchema } from './szeneSchema.ts';
import { aktSchema } from './aktSchema.ts';

export const metaSchemas: Record<MetaNodeType, MetaTypeSchema> = {
  chapter: kapitelSchema,
  scene: szeneSchema,
  action: aktSchema,
};

export type { MetaFieldDef, MetaTypeSchema } from './metaSchema.ts';
