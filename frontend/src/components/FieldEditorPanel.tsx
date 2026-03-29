import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, X } from 'lucide-react';

interface FieldEditorPanelProps {
  fieldLabel: string;
  sceneTitle?: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export function FieldEditorPanel({ fieldLabel, sceneTitle, value: externalValue, onSave, onClose }: FieldEditorPanelProps) {
  const [value, setValue] = useState(externalValue);
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync when the external value changes (e.g. AI field-update applied from chat)
  useEffect(() => {
    setValue(externalValue);
    setDirty(false);
  }, [externalValue]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    onSave(value);
    setDirty(false);
  }, [onSave, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    onClose();
  }, [dirty, onClose]);

  return (
    <div className="field-editor-panel">
      <div className="field-editor-header">
        <div className="field-editor-title">
          {sceneTitle && (
            <span className="field-editor-scene-title">{sceneTitle}</span>
          )}
          {sceneTitle && <span className="field-editor-title-sep">/</span>}
          <span className="field-editor-field-label">{fieldLabel}</span>
          {dirty && <span className="field-editor-dirty">*</span>}
        </div>
        <div className="field-editor-header-actions">
          <button
            type="button"
            className="field-editor-save-btn"
            onClick={handleSave}
            disabled={!dirty}
            title="Speichern (Ctrl+S)"
          >
            <Save size={13} />
            <span>Speichern</span>
          </button>
          <button
            type="button"
            className="field-editor-close-btn"
            onClick={handleClose}
            title="Schließen"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="field-editor-body">
        <textarea
          ref={textareaRef}
          className="field-editor-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`${fieldLabel} eingeben…`}
          spellCheck
        />
      </div>
    </div>
  );
}
