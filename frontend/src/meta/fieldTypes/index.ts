import { inputRenderer } from './input.tsx';
import { textareaRenderer } from './textarea.tsx';
import { wikiTextareaRenderer } from './wikitextarea.tsx';
import type { FieldRenderer } from '../metaSchema.ts';

export const fieldTypeRegistry: Record<string, FieldRenderer> = {
  input: inputRenderer,
  textarea: textareaRenderer,
  wikitextarea: wikiTextareaRenderer,
};
