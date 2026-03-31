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
  {
    name: 'Charakter',
    description: 'Personen und NPCs',
    fields: [
      // ── Identität ────────────────────────────────────────────────────────────
      {
        key: 'name',
        label: 'Name',
        type: 'input',
        placeholder: 'Vollständiger Name...',
        defaultValue: '',
      },
      {
        key: 'titel',
        label: 'Titel / Anrede',
        type: 'input',
        placeholder: 'z.B. Gräfin, Sir, Magier...',
        defaultValue: '',
      },
      {
        key: 'rolle',
        label: 'Rolle',
        type: 'input',
        placeholder: 'z.B. Antagonist, NPC, Auftraggeberin...',
        defaultValue: '',
      },
      {
        key: 'gruppe',
        label: 'Gruppe / Fraktion',
        type: 'input',
        placeholder: 'z.B. Morningstar, Blue Roses...',
        defaultValue: '',
      },
      {
        key: 'alignment',
        label: 'Alignment',
        type: 'input',
        placeholder: 'z.B. Neutral, Moralisches Dilemma, Böse...',
        defaultValue: '',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'input',
        placeholder: 'z.B. Lebendig, Tot, Verwandelt...',
        defaultValue: '',
      },
      // ── Basisdaten ───────────────────────────────────────────────────────────
      {
        key: 'alter',
        label: 'Alter',
        type: 'input',
        placeholder: 'z.B. 24...',
        defaultValue: '',
      },
      {
        key: 'herkunft',
        label: 'Herkunft',
        type: 'input',
        placeholder: 'z.B. Re-Estize Kingdom, Kleinadel...',
        defaultValue: '',
      },
      // ── Beschreibung ─────────────────────────────────────────────────────────
      {
        key: 'aussehen',
        label: 'Aussehen',
        type: 'wikitextarea',
        placeholder: 'Körperbau, Haare, Augen, Kleidung, markante Merkmale... (@Name für Wiki-Links)',
        defaultValue: '',
      },
      {
        key: 'persoenlichkeit',
        label: 'Persönlichkeit',
        type: 'wikitextarea',
        placeholder: 'Kernzüge, Verhalten, Stärken, Schwächen... (@Name für Wiki-Links)',
        defaultValue: '',
      },
      {
        key: 'motivation',
        label: 'Motivation / Ziel',
        type: 'wikitextarea',
        placeholder: 'Was will der Charakter und warum? (@Name für Wiki-Links)',
        defaultValue: '',
      },
      // ── Story-Kontext ─────────────────────────────────────────────────────────
      {
        key: 'hintergrund',
        label: 'Hintergrund',
        type: 'wikitextarea',
        placeholder: 'Vorgeschichte, relevante Ereignisse... (@Name für Wiki-Links)',
        defaultValue: '',
      },
      {
        key: 'beziehungen',
        label: 'Wichtige Beziehungen',
        type: 'wikitextarea',
        placeholder: 'z.B. Mitglied von @[Morningstar], aufgewachsen in @[E-Rantel]...',
        defaultValue: '',
      },
      // ── KI-Hilfsfelder ────────────────────────────────────────────────────────
      {
        key: 'namenskonvention',
        label: 'Namenskonvention',
        type: 'wikitextarea',
        placeholder:
          'Wie wird der Charakter in verschiedenen Kontexten angesprochen?\n' +
          'z.B. POV: "Heia" | Erzähler: "Lady Valdren" | Formal: "Gräfin Valdren" (@Name für Wiki-Links)',
        defaultValue: '',
      },
      {
        key: 'ki_hinweise',
        label: 'Hinweise für KI',
        type: 'wikitextarea',
        placeholder:
          'Wichtige Regeln für Konsistenz, Dinge die vermieden werden sollen, ' +
          'Tonalität, Besonderheiten... (@Name für Wiki-Links)',
        defaultValue: '',
      },
    ] satisfies WikiFieldDef[],
  },
];
