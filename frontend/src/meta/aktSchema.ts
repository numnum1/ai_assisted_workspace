import type { MetaTypeSchema } from './metaSchema.ts';

export const aktSchema: MetaTypeSchema = {
  filename: 'akt.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Titel...', defaultValue: '' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
    { key: 'location', label: 'Lokation', type: 'input', placeholder: 'Lokation...', defaultValue: '' },
    { key: 'time', label: 'Zeit', type: 'input', placeholder: 'Zeit...', defaultValue: '' },
  ],
};
