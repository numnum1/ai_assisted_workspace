import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { WikiType, WikiFieldDef } from '../types.ts';

interface WikiTypeEditorProps {
  type: WikiType;
  onSave: (updated: WikiType) => Promise<void>;
  onClose: () => void;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueKey(base: string, fields: WikiFieldDef[], excludeIdx: number): string {
  const others = fields.filter((_, i) => i !== excludeIdx).map(f => f.key);
  let key = base || 'feld';
  let counter = 2;
  while (others.includes(key)) {
    key = `${base}-${counter++}`;
  }
  return key;
}

export function WikiTypeEditor({ type, onSave, onClose }: WikiTypeEditorProps) {
  const [name, setName] = useState(type.name);
  const [fields, setFields] = useState<WikiFieldDef[]>(() =>
    type.fields.map(f => ({ ...f }))
  );

  useEffect(() => {
    setName(type.name);
    setFields(type.fields.map(f => ({ ...f })));
  }, [type]);

  const handleFieldLabelChange = (idx: number, label: string) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const key = slugify(label) || f.key;
      return { ...f, label, key: uniqueKey(key, prev, idx) };
    }));
  };

  const handleFieldTypeChange = (idx: number, fieldType: string) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, type: fieldType } : f));
  };

  const handleAddField = () => {
    const base = 'neues-feld';
    const key = uniqueKey(base, fields, -1);
    setFields(prev => [...prev, { key, label: 'Neues Feld', type: 'input', placeholder: '', defaultValue: '' }]);
  };

  const handleDeleteField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const updated: WikiType = { ...type, name: name.trim() || type.name, fields };
    await onSave(updated);
  };

  return (
    <div className="wiki-entry-popup-overlay" onClick={onClose}>
      <div className="wiki-type-editor-popup" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="wiki-type-editor-header">
          <span className="wiki-type-editor-title">Typ bearbeiten</span>
          <button className="meta-panel-close-btn" onClick={onClose} title="Schließen">
            <X size={14} />
          </button>
        </div>

        {/* Type name */}
        <div className="wiki-type-editor-body">
          <div className="wiki-type-editor-section-label">Typ-Name</div>
          <input
            className="meta-field-input wiki-type-editor-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Typ-Name..."
          />

          {/* Fields */}
          <div className="wiki-type-editor-section-label" style={{ marginTop: 16 }}>
            Felder
          </div>
          <div className="wiki-type-editor-fields">
            {fields.map((field, idx) => (
              <div key={idx} className="wiki-type-editor-field-row">
                <input
                  className="meta-field-input wiki-type-editor-field-label"
                  value={field.label}
                  onChange={e => handleFieldLabelChange(idx, e.target.value)}
                  placeholder="Bezeichnung..."
                  title={`Key: ${field.key}`}
                />
                <select
                  className="wiki-type-editor-field-type"
                  value={field.type === 'textarea' ? 'wikitextarea' : field.type}
                  onChange={e => handleFieldTypeChange(idx, e.target.value)}
                >
                  <option value="input">Einzeilig</option>
                  <option value="wikitextarea">Fließtext (mit Wiki-Links)</option>
                </select>
                <button
                  className="wiki-type-editor-field-delete"
                  onClick={() => handleDeleteField(idx)}
                  title="Feld löschen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <button className="wiki-type-editor-add-field" onClick={handleAddField}>
              <Plus size={13} />
              Feld hinzufügen
            </button>
          </div>

          {/* Actions */}
          <div className="wiki-type-editor-actions">
            <button className="wiki-type-editor-cancel" onClick={onClose}>
              Abbrechen
            </button>
            <button className="wiki-type-editor-save" onClick={handleSave}>
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
