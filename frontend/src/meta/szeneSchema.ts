import type { MetaTypeSchema } from './metaSchema.ts';

export const szeneSchema: MetaTypeSchema = {
  filename: 'szene.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Titel...', defaultValue: '' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
  ],
};
