import { useState, useEffect } from 'react';
import { Save, X, Maximize2, ExternalLink } from 'lucide-react';
import type { MetaTypeSchema } from '../meta/metaSchema.ts';
import { fieldTypeRegistry } from '../meta/fieldTypes/index.ts';

export interface AssetPanelProps {
  schema: MetaTypeSchema;
  values: Record<string, string>;
  title: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
  onExpand?: () => void;
  expanded?: boolean;
  onFocusField?: (fieldKey: string, fieldLabel: string, value: string) => void;
}

export function AssetPanel({ schema, values: initialValues, title, onSave, onClose, onExpand, expanded, onFocusField }: AssetPanelProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [dirty, setDirty] = useState(false);

  // Use stringified comparison so re-renders that create new object references
  // (but same data) don't reset the user's in-progress edits.
  const initialValuesStr = JSON.stringify(initialValues);
  useEffect(() => {
    setValues(initialValues);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValuesStr]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(values);
    setDirty(false);
  };

  return (
    <div className={`meta-panel${expanded ? ' meta-panel--expanded' : ''}`}>
      <div className="meta-panel-header">
        <span className="meta-panel-filename">{title}</span>
        <div className="meta-panel-header-actions">
          {dirty && (
            <button className="meta-panel-save-btn" onClick={handleSave} title="Speichern">
              <Save size={13} />
            </button>
          )}
          {onExpand && !expanded && (
            <button className="meta-panel-expand-btn" onClick={onExpand} title="Im Haupteditor öffnen">
              <Maximize2 size={13} />
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
          const canFocus = onFocusField && (field.type === 'textarea' || field.type === 'wikitextarea');
          return (
            <div key={field.key} className="meta-field">
              <div className="meta-field-label-row">
                <label className="meta-field-label">{field.label}</label>
                {canFocus && (
                  <button
                    type="button"
                    className="meta-field-focus-btn"
                    title={`„${field.label}" im Editor öffnen`}
                    onClick={() => onFocusField!(field.key, field.label, values[field.key] ?? '')}
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
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
