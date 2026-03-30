import { useState } from 'react';
import { X, Folder, Plus } from 'lucide-react';
import { wikiTypePresets } from '../../wiki/presets.ts';
import type { WikiTypePreset } from '../../wiki/presets.ts';
import type { WikiFieldDef } from '../../types.ts';

interface WikiTypePickerDialogProps {
  onConfirm: (name: string, fields?: WikiFieldDef[]) => Promise<void>;
  onClose: () => void;
}

const EMPTY_PRESET: WikiTypePreset = {
  name: '',
  description: 'Eigene Felder definieren',
  fields: [],
};

export function WikiTypePickerDialog({ onConfirm, onClose }: WikiTypePickerDialogProps) {
  const [selected, setSelected] = useState<WikiTypePreset | null>(
    wikiTypePresets.length > 0 ? null : null
  );
  const [name, setName] = useState('');

  const handleSelect = (preset: WikiTypePreset | null) => {
    setSelected(preset);
    if (preset && preset.name) {
      setName(preset.name);
    }
  };

  const handleConfirm = async () => {
    const finalName = name.trim();
    if (!finalName) return;
    if (selected) {
      await onConfirm(finalName, selected.fields.length > 0 ? selected.fields : undefined);
    } else {
      await onConfirm(finalName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  const allPresets = wikiTypePresets;

  return (
    <div className="wiki-entry-popup-overlay" onClick={onClose}>
      <div className="wiki-type-picker-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="wiki-type-editor-header">
          <span className="wiki-type-editor-title">Neuer Wiki-Typ</span>
          <button className="meta-panel-close-btn" onClick={onClose} title="Schließen">
            <X size={14} />
          </button>
        </div>

        <div className="wiki-type-picker-body">
          {/* Presets grid – only shown when there are presets */}
          {allPresets.length > 0 && (
            <>
              <div className="wiki-type-editor-section-label">Vorlage wählen</div>
              <div className="wiki-type-picker-grid">
                {/* Empty / custom option */}
                <div
                  className={`wiki-type-picker-card${selected === null ? ' selected' : ''}`}
                  onClick={() => handleSelect(null)}
                  title="Leeren Typ erstellen"
                >
                  <Plus size={22} className="wiki-type-picker-card-icon" />
                  <span className="wiki-type-picker-card-name">Leer</span>
                  <span className="wiki-type-picker-card-desc">{EMPTY_PRESET.description}</span>
                </div>

                {allPresets.map(preset => (
                  <div
                    key={preset.name}
                    className={`wiki-type-picker-card${selected === preset ? ' selected' : ''}`}
                    onClick={() => handleSelect(preset)}
                    title={preset.description}
                  >
                    <Folder size={22} className="wiki-type-picker-card-icon" />
                    <span className="wiki-type-picker-card-name">{preset.name}</span>
                    <span className="wiki-type-picker-card-desc">{preset.description}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Name input */}
          <div className="wiki-type-editor-section-label" style={{ marginTop: allPresets.length > 0 ? 14 : 0 }}>
            Name
          </div>
          <input
            className="meta-field-input wiki-type-editor-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ-Name..."
            autoFocus
          />

          {/* Actions */}
          <div className="wiki-type-editor-actions">
            <button className="wiki-type-editor-cancel" onClick={onClose}>
              Abbrechen
            </button>
            <button
              className="wiki-type-editor-save"
              onClick={handleConfirm}
              disabled={!name.trim()}
            >
              Erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
