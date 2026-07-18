import type { MetaTypeSchema } from './metaSchema.ts';
import { statusOptions, statusLabels } from './nodeStatus.ts';

export const kapitelSchema: MetaTypeSchema = {
  filename: 'kapitel.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Titel...', defaultValue: '' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
    { key: 'status', label: 'Status', type: 'selector', defaultValue: 'included', options: statusOptions, config: { labels: statusLabels } },
  ],
};
