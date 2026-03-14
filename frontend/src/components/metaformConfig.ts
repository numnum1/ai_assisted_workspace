export type FieldType = 'text' | 'textarea' | 'select';

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  rows?: number;
  options?: string[];
}

export interface TypeConfig {
  fields: FieldConfig[];
}

export const STATUS_OPTIONS = ['draft', 'written', 'revised', 'final'];

export const HIDDEN_FIELDS = new Set(['type', 'id', 'child_order']);

export const METAFORM_CONFIG: Record<string, TypeConfig> = {
  book: {
    fields: [
      { key: 'name',                  label: 'Name',                 type: 'text',     placeholder: 'Titel des Buches' },
      { key: 'universum',             label: 'Universum',            type: 'text',     placeholder: 'z.B. Overlord, eigenes Universum...' },
      { key: 'zeitliche_einordnung',  label: 'Zeitliche Einordnung', type: 'text',     placeholder: 'z.B. Nach Light Novel 3' },
      { key: 'beschreibung',          label: 'Beschreibung',         type: 'textarea', placeholder: 'Worum geht es in diesem Buch?', rows: 4 },
    ],
  },
  chapter: {
    fields: [
      { key: 'title',           label: 'Titel',           type: 'text',     placeholder: 'Kapitelname' },
      { key: 'status',          label: 'Status',          type: 'select',   options: STATUS_OPTIONS },
      { key: 'zusammenfassung', label: 'Zusammenfassung', type: 'textarea', placeholder: 'Was passiert in diesem Kapitel?', rows: 4 },
    ],
  },
  scene: {
    fields: [
      { key: 'title',           label: 'Titel',           type: 'text',     placeholder: 'Szenenname' },
      { key: 'status',          label: 'Status',          type: 'select',   options: STATUS_OPTIONS },
      { key: 'zusammenfassung', label: 'Zusammenfassung', type: 'textarea', placeholder: 'Was passiert in dieser Szene?', rows: 4 },
    ],
  },
  action: {
    fields: [
      { key: 'title',        label: 'Titel',        type: 'text',     placeholder: 'Bezeichnung der Aktion' },
      { key: 'status',       label: 'Status',       type: 'select',   options: STATUS_OPTIONS },
      { key: 'ort',          label: 'Ort',          type: 'text',     placeholder: 'Wo findet die Aktion statt?' },
      { key: 'character',    label: 'Charakter',    type: 'text',     placeholder: 'Wer handelt?' },
      { key: 'was_passiert', label: 'Was passiert', type: 'textarea', placeholder: 'Was geschieht in dieser Aktion?', rows: 3 },
      { key: 'ziel',         label: 'Ziel',         type: 'textarea', placeholder: 'Was soll diese Aktion narrativ erreichen?', rows: 2 },
    ],
  },
  arc: {
    fields: [
      { key: 'title',           label: 'Titel',           type: 'text',     placeholder: 'Arcname' },
      { key: 'thema',           label: 'Thema',           type: 'text',     placeholder: 'Zentrales Thema des Arcs...' },
      { key: 'zusammenfassung', label: 'Zusammenfassung', type: 'textarea', placeholder: 'Kurze Beschreibung des Arcs...', rows: 4 },
    ],
  },
};
