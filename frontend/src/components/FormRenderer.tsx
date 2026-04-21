import { useCallback, useRef, useEffect, useState } from "react";
import {
  Save,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { typedFilesApi } from "../api.ts";

interface TypeField {
  key: string;
  label: string;
  type: string;
  hint?: string;
}

interface TypeSection {
  key: string;
  label: string;
  fields: TypeField[];
}

interface TypeDefinition {
  name: string;
  fields: TypeField[];
  sections: TypeSection[];
}

interface FormRendererProps {
  filePath: string;
  typeDef: TypeDefinition;
  data: Record<string, unknown>;
  isDirty: boolean;
  loading: boolean;
  error: string | null;
  onChange: (data: Record<string, unknown>) => void;
  onSave: () => Promise<void>;
}

export function FormRenderer({
  filePath,
  typeDef,
  data,
  isDirty,
  loading,
  error,
  onChange,
  onSave,
}: FormRendererProps) {
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  const filename = filePath.includes("/")
    ? filePath.substring(filePath.lastIndexOf("/") + 1)
    : filePath;

  const handleAiFill = useCallback(async () => {
    setFilling(true);
    setFillError(null);
    try {
      const body = await typedFilesApi.fill(filePath);
      if (body.data) onChange(body.data as Record<string, unknown>);
    } catch (err) {
      setFillError(err instanceof Error ? err.message : String(err));
    } finally {
      setFilling(false);
    }
  }, [filePath, onChange]);

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange],
  );

  const handleSave = useCallback(async () => {
    await onSave();
  }, [onSave]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="editor-container">
        <div className="form-loading">Wird geladen…</div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <span className="editor-filename">
          {filename}
          {isDirty && <span className="editor-dirty"> ●</span>}
        </span>
        <div className="editor-header-actions">
          <span className="form-type-badge">{typeDef.name}</span>
          <button
            className="editor-mode-btn"
            onClick={handleAiFill}
            disabled={filling}
            title="KI füllt das Formular basierend auf dem Projektkontext aus"
          >
            <Sparkles size={14} />
            {filling ? "KI arbeitet…" : "KI ausfüllen"}
          </button>
          <button
            className="editor-save-btn"
            onClick={handleSave}
            disabled={!isDirty}
            title="Speichern (Ctrl+S)"
          >
            <Save size={14} />
            Speichern
          </button>
        </div>
      </div>

      {(error || fillError) && (
        <div className="form-error">{error ?? fillError}</div>
      )}

      <div className="form-body">
        {/* Top-level fields */}
        {typeDef.fields.length > 0 && (
          <div className="form-section">
            {typeDef.fields.map((field) => (
              <FormField
                key={field.key}
                field={field}
                value={
                  typeof data[field.key] === "string"
                    ? (data[field.key] as string)
                    : ""
                }
                onChange={(val) => handleFieldChange(field.key, val)}
              />
            ))}
          </div>
        )}

        {/* Repeatable sections */}
        {typeDef.sections.map((section) => (
          <RepeatableSection
            key={section.key}
            section={section}
            items={getSectionItems(data, section.key)}
            onChange={(items) => onChange({ ...data, [section.key]: items })}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Field ─────────────────────────────────────────────────────────────────────

interface FormFieldProps {
  field: TypeField;
  value: string;
  onChange: (value: string) => void;
}

function FormField({ field, value, onChange }: FormFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="form-field">
      <label className="form-label">
        {field.label}
        {field.hint && <span className="form-hint">{field.hint}</span>}
      </label>
      {field.type === "longtext" ? (
        <textarea
          ref={textareaRef}
          className="form-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.hint ?? ""}
        />
      ) : (
        <input
          className="form-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.hint ?? ""}
        />
      )}
    </div>
  );
}

// ─── Repeatable Section ────────────────────────────────────────────────────────

interface RepeatableSectionProps {
  section: TypeSection;
  items: Record<string, string>[];
  onChange: (items: Record<string, string>[]) => void;
}

function RepeatableSection({
  section,
  items,
  onChange,
}: RepeatableSectionProps) {
  const addItem = () => {
    const empty: Record<string, string> = {};
    section.fields.forEach((f: TypeField) => (empty[f.key] = ""));
    onChange([...items, empty]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const newItems = [...items];
    const target = index + direction;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    onChange(newItems);
  };

  const updateItem = (index: number, key: string, value: string) => {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item,
    );
    onChange(newItems);
  };

  return (
    <div className="form-repeatable-section">
      <div className="form-section-header">
        <span className="form-section-title">{section.label}</span>
        <button className="form-add-btn" onClick={addItem} title="Hinzufügen">
          <Plus size={13} />
          Hinzufügen
        </button>
      </div>

      {items.length === 0 && (
        <div className="form-empty-section">
          Noch keine {section.label}. Klick auf „Hinzufügen".
        </div>
      )}

      {items.map((item, index) => (
        <div key={index} className="form-item-card">
          <div className="form-item-header">
            <span className="form-item-label">
              {item["titel"] || `${section.label} ${index + 1}`}
            </span>
            <div className="form-item-actions">
              <button
                className="form-icon-btn"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                title="Nach oben"
              >
                <ChevronUp size={13} />
              </button>
              <button
                className="form-icon-btn"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                title="Nach unten"
              >
                <ChevronDown size={13} />
              </button>
              <button
                className="form-icon-btn form-icon-btn-danger"
                onClick={() => removeItem(index)}
                title="Entfernen"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div className="form-item-fields">
            {section.fields.map((field) => (
              <FormField
                key={field.key}
                field={field}
                value={
                  typeof item[field.key] === "string" ? item[field.key] : ""
                }
                onChange={(val) => updateItem(index, field.key, val)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSectionItems(
  data: Record<string, unknown>,
  key: string,
): Record<string, string>[] {
  const raw = data[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Record<string, string> =>
      item !== null && typeof item === "object",
  );
}
