import type { MetaTypeSchema } from './metaSchema.ts';

export const szeneSchema: MetaTypeSchema = {
  filename: 'szene.json',
  fields: [
    { key: 'title', label: 'Titel', type: 'input', placeholder: 'Titel...', defaultValue: '' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
    { key: 'location', label: 'Lokation', type: 'input', placeholder: 'Lokation...', defaultValue: '' },
    { key: 'time', label: 'Zeit', type: 'input', placeholder: 'Zeit...', defaultValue: '' },

    { key: 'characters', label: 'Charaktere', type: 'textarea', placeholder: 'Charakter hinzufügen...', defaultValue: '' },
    { key: 'goal', label: 'Ziel der Szene', type: 'input', placeholder: 'Was will der Protagonist erreichen?', defaultValue: '' },
    { key: 'conflict', label: 'Konflikt', type: 'textarea', placeholder: 'Was steht im Weg?', defaultValue: '' },
    { key: 'outcome', label: 'Ergebnis', type: 'textarea', placeholder: 'Wie endet die Szene?', defaultValue: '' },
    { key: 'tone', label: 'Stimmung', type: 'input', placeholder: '', defaultValue: '' },
    { key: 'importance', label: 'Bedeutung', type: 'input', defaultValue: 'setup' },
  ],
};
