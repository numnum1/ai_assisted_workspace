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
        type: 'textarea',
        placeholder: 'Körperbau, Haare, Augen, Kleidung, markante Merkmale...',
        defaultValue: '',
      },
      {
        key: 'persoenlichkeit',
        label: 'Persönlichkeit',
        type: 'textarea',
        placeholder: 'Kernzüge, Verhalten, Stärken, Schwächen...',
        defaultValue: '',
      },
      {
        key: 'motivation',
        label: 'Motivation / Ziel',
        type: 'textarea',
        placeholder: 'Was will der Charakter und warum?',
        defaultValue: '',
      },
      // ── Story-Kontext ─────────────────────────────────────────────────────────
      {
        key: 'hintergrund',
        label: 'Hintergrund',
        type: 'textarea',
        placeholder: 'Vorgeschichte, relevante Ereignisse...',
        defaultValue: '',
      },
      {
        key: 'beziehungen',
        label: 'Wichtige Beziehungen',
        type: 'textarea',
        placeholder: 'Name – Beziehungsart (z.B. Nils – Verlobter/Werkzeug)...',
        defaultValue: '',
      },
      // ── KI-Hilfsfelder ────────────────────────────────────────────────────────
      {
        key: 'namenskonvention',
        label: 'Namenskonvention',
        type: 'textarea',
        placeholder:
          'Wie wird der Charakter in verschiedenen Kontexten angesprochen?\n' +
          'z.B. POV: "Heia" | Erzähler: "Lady Valdren" | Formal: "Gräfin Valdren"',
        defaultValue: '',
      },
      {
        key: 'ki_hinweise',
        label: 'Hinweise für KI',
        type: 'textarea',
        placeholder:
          'Wichtige Regeln für Konsistenz, Dinge die vermieden werden sollen, ' +
          'Tonalität, Besonderheiten...',
        defaultValue: '',
      },
    ] satisfies WikiFieldDef[],
  },
];
