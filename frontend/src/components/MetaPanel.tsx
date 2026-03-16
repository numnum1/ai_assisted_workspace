import type { MetaSelection, NodeMeta, MetaNodeType } from '../types.ts';
import { metaSchemas } from '../meta/index.ts';
import { SchemaFormPanel } from './SchemaFormPanel.tsx';

interface MetaPanelProps {
  selection: MetaSelection;
  onSave: (type: MetaNodeType, meta: NodeMeta, chapterId: string, sceneId?: string, actionId?: string) => void;
  onClose: () => void;
}

function buildInitialValues(selection: MetaSelection): Record<string, string> {
  const schema = metaSchemas[selection.type];
  const values: Record<string, string> = {};
  for (const field of schema.fields) {
    if (field.key === 'title') {
      values[field.key] = selection.meta.title ?? field.defaultValue;
    } else if (field.key === 'description') {
      values[field.key] = selection.meta.description ?? field.defaultValue;
    } else {
      values[field.key] = selection.meta.extras?.[field.key] ?? field.defaultValue;
    }
  }
  return values;
}

export function MetaPanel({ selection, onSave, onClose }: MetaPanelProps) {
  const schema = metaSchemas[selection.type];
  const initialValues = buildInitialValues(selection);

  const handleSave = (values: Record<string, string>) => {
    const extras: Record<string, string> = {};
    for (const key of Object.keys(values)) {
      if (key !== 'title' && key !== 'description') {
        extras[key] = values[key];
      }
    }
    const meta: NodeMeta = {
      title: (values['title'] ?? '').trim(),
      description: (values['description'] ?? '').trim(),
      sortOrder: selection.meta.sortOrder,
      extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
    onSave(selection.type, meta, selection.chapterId, selection.sceneId, selection.actionId);
  };

  return (
    <SchemaFormPanel
      schema={schema}
      values={initialValues}
      title={schema.filename}
      onSave={handleSave}
      onClose={onClose}
    />
  );
}
