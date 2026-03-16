import { wikiInputRenderer } from './wikiinput.tsx';
import { wikiTextareaRenderer } from './wikitextarea.tsx';
import type { FieldRenderer } from '../metaSchema.ts';

export const fieldTypeRegistry: Record<string, FieldRenderer> = {
  input: wikiInputRenderer,        // Wiki-Links auch in einzeiligen Feldern
  textarea: wikiTextareaRenderer,
  wikitextarea: wikiTextareaRenderer,
};
