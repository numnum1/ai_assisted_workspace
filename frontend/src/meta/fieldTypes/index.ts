import { wikiInputRenderer } from './wikiinput.tsx';
import { wikiTextareaRenderer } from './wikitextarea.tsx';
import { selectorRenderer } from './selector.tsx';
import type { FieldRenderer } from '../metaSchema.ts';

export interface FieldTypeDef {
  id: string;
  label: string;
  renderer: FieldRenderer;
  availableInWikiEditor: boolean;
}

export const fieldTypeDefinitions: FieldTypeDef[] = [
  { id: 'input',       label: 'Einzeilig',                renderer: wikiInputRenderer,   availableInWikiEditor: true  },
  { id: 'textarea',    label: 'Textarea',                 renderer: wikiTextareaRenderer, availableInWikiEditor: false },
  { id: 'wikitextarea',label: 'Fließtext (mit Wiki-Links)', renderer: wikiTextareaRenderer, availableInWikiEditor: true  },
  { id: 'selector',    label: 'Dropdown',                 renderer: selectorRenderer,    availableInWikiEditor: false },
];

export const fieldTypeRegistry: Record<string, FieldRenderer> = Object.fromEntries(
  fieldTypeDefinitions.map(d => [d.id, d.renderer])
);

export const wikiEditorFieldTypeOptions = fieldTypeDefinitions
  .filter(d => d.availableInWikiEditor)
  .map(d => ({ value: d.id, label: d.label }));
