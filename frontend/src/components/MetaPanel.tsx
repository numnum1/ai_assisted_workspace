import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import type { MetaSelection, NodeMeta, MetaNodeType } from '../types.ts';
import { metaSchemas } from '../meta/index.ts';

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
  const [values, setValues] = useState<Record<string, string>>(() => buildInitialValues(selection));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValues(buildInitialValues(selection));
    setDirty(false);
  }, [selection]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
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
    setDirty(false);
  };

  return (
    <div className="meta-panel">
      <div className="meta-panel-header">
        <span className="meta-panel-filename">{schema.filename}</span>
        <div className="meta-panel-header-actions">
          {dirty && (
            <button className="meta-panel-save-btn" onClick={handleSave} title="Speichern">
              <Save size={13} />
            </button>
          )}
          <button className="meta-panel-close-btn" onClick={onClose} title="Schließen">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="meta-panel-body">
        {schema.fields.map(field => (
          <div key={field.key} className="meta-field">
            <label className="meta-field-label">{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                className="meta-field-textarea"
                value={values[field.key] ?? ''}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={4}
              />
            ) : (
              <input
                className="meta-field-input"
                value={values[field.key] ?? ''}
                onChange={e => handleChange(field.key, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}

        {dirty && (
          <button className="meta-panel-save-full-btn" onClick={handleSave}>
            <Save size={13} />
            Speichern
          </button>
        )}
      </div>
    </div>
  );
}
