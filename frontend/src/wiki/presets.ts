import type { WikiFieldDef } from '../types.ts';

export interface WikiTypePreset {
  name: string;
  description: string;
  fields: WikiFieldDef[];
}

// ─── Presets ──────────────────────────────────────────────────────────────────
// Hier neue Presets hinzufügen. Jedes Preset erscheint als Karte im
// "Neuer Wiki-Typ"-Dialog. Felder werden beim Erstellen übernommen.

export const wikiTypePresets: WikiTypePreset[] = [
  // Beispiel:
  // {
  //   name: 'Charakter',
  //   description: 'Personen und NPCs',
  //   fields: [
  //     { key: 'name',         label: 'Name',         type: 'input',    placeholder: 'Name...',         defaultValue: '' },
  //     { key: 'beschreibung', label: 'Beschreibung', type: 'textarea', placeholder: 'Beschreibung...', defaultValue: '' },
  //   ],
  // },
];
