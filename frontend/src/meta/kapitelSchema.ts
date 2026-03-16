import type { MetaTypeSchema } from './metaSchema.ts';

export const kapitelSchema: MetaTypeSchema = {
  filename: 'kapitel.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Titel...', defaultValue: '' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
  ],
};
