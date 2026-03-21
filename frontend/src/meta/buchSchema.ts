import type { MetaTypeSchema } from './metaSchema.ts';

export const buchSchema: MetaTypeSchema = {
  filename: 'book.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Buchtitel...', defaultValue: '' },
    { key: 'description', label: 'Kurzbeschreibung', type: 'input', placeholder: 'Ein Satz...', defaultValue: '' },
    { key: 'synopsis', label: 'Synopsis (für KI)', type: 'largetextarea', placeholder: 'Gesamte Story zusammenfassen...', defaultValue: '' },
  ],
};
