import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import type { MetaTypeSchema } from '../meta/metaSchema.ts';
import { fieldTypeRegistry } from '../meta/fieldTypes/index.ts';

export interface AssetPanelProps {
  schema: MetaTypeSchema;
  values: Record<string, string>;
  title: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}

export function AssetPanel({ schema, values: initialValues, title, onSave, onClose }: AssetPanelProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValues(initialValues);
    setDirty(false);
  }, [initialValues]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(values);
    setDirty(false);
  };

  return (
    <div className="meta-panel">
      <div className="meta-panel-header">
        <span className="meta-panel-filename">{title}</span>
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
        {schema.fields.map(field => {
          const Renderer = fieldTypeRegistry[field.type] ?? fieldTypeRegistry['input'];
          return (
            <div key={field.key} className="meta-field">
              <label className="meta-field-label">{field.label}</label>
              <Renderer
                field={field}
                value={values[field.key] ?? ''}
                onChange={v => handleChange(field.key, v)}
                onCommit={handleSave}
              />
            </div>
          );
        })}

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
