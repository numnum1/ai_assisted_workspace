import type { CommentCategoryDef } from '../../types.ts';

export type { CommentCategoryDef };

/**
 * Built-in default comment categories. Used as the seed when a project has not
 * yet configured its own list (see ProjectSettingsModal's "Kommentar-Kategorien"
 * tab) and as a last-resort fallback if loading the project's categories fails.
 */
export const DEFAULT_COMMENT_CATEGORIES: CommentCategoryDef[] = [
  {
    id: 'rechtschreibung',
    label: 'Rechtschreibung',
    color: '#e06c75',
    promptFragment:
      'Rechtschreibung, Grammatik, Zeichensetzung und Tippfehler. Weise auf konkrete Fehler hin und nenne die korrekte Schreibweise.',
  },
  {
    id: 'lore',
    label: 'Lore',
    color: '#c678dd',
    promptFragment:
      'Konsistenz der Lore/Weltenbau: Widersprüche zu etablierten Fakten, Namen, Zeitabläufen, Regeln der Welt oder Figureneigenschaften.',
  },
  {
    id: 'storytelling',
    label: 'Story-Telling',
    color: '#61afef',
    promptFragment:
      'Erzählhandwerk: Spannungsaufbau, Pacing, Figurenmotivation, Logik der Handlung, Show-vs-Tell und dramaturgische Wirkung.',
  },
  {
    id: 'formulierung',
    label: 'Formulierung',
    color: '#98c379',
    promptFragment:
      'Bessere Formulierungen: schwache oder umständliche Sätze, Wortwiederholungen, Stil und Rhythmus. Schlage konkrete Alternativen vor.',
  },
];

/** Fallback colour for a category id no longer present in the current list. */
export const OTHER_CATEGORY_COLOR = '#abb2bf';

export function findCategory(
  defs: CommentCategoryDef[],
  id: string,
): CommentCategoryDef | undefined {
  return defs.find((c) => c.id === id);
}

export function categoryColor(defs: CommentCategoryDef[], id: string): string {
  return findCategory(defs, id)?.color ?? OTHER_CATEGORY_COLOR;
}

export function categoryLabel(defs: CommentCategoryDef[], id: string): string {
  return findCategory(defs, id)?.label ?? 'Sonstiges';
}
