import { useState, useEffect, useCallback, useRef } from 'react';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Save, FileCode } from 'lucide-react';
import { METAFORM_CONFIG, FIELD_RENDERERS, HIDDEN_FIELDS, type FieldConfig } from './metaformConfig.tsx';

interface MetafileEditorProps {
  content: string;
  filePath: string;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onOpenSourceFile: () => void;
}

function splitFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) return { fm: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: raw };
  const fmStr = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, '');
  try {
    const fm = parseYaml(fmStr) ?? {};
    return { fm: typeof fm === 'object' ? (fm as Record<string, unknown>) : {}, body };
  } catch {
    return { fm: {}, body: raw };
  }
}

function serializeToContent(fm: Record<string, unknown>, body: string): string {
  const fmStr = stringifyYaml(fm, { lineWidth: 0 }).trimEnd();
  return `---\n${fmStr}\n---\n${body}`;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function fallbackFields(fm: Record<string, unknown>): FieldConfig[] {
  return Object.keys(fm)
    .filter(key => !HIDDEN_FIELDS.has(key))
    .map(key => ({ key, label: key, type: 'text' as const }));
}

// ── Generic field renderer ────────────────────────────────────────────────────

function MetaFormField({
  field,
  fm,
  onChange,
}: {
  field: FieldConfig;
  fm: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const value = asString(fm[field.key]);
  return FIELD_RENDERERS[field.type]({ field, value, onChange: v => onChange(field.key, v) });
}

// ── Main MetafileEditor ───────────────────────────────────────────────────────

export function MetafileEditor({
  content,
  filePath,
  isDirty,
  onChange,
  onSave,
  onOpenSourceFile,
}: MetafileEditorProps) {
  const { fm: initialFm, body: initialBody } = splitFrontmatter(content);
  const [fm, setFm] = useState<Record<string, unknown>>(initialFm);
  const [body, setBody] = useState(initialBody);

  // Re-parse when a different file is opened
  useEffect(() => {
    const { fm: parsedFm, body: parsedBody } = splitFrontmatter(content);
    setFm(parsedFm);
    setBody(parsedBody);
  // Only re-run when filePath changes, not on every content change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitChange = useCallback(
    (nextFm: Record<string, unknown>, nextBody: string) => {
      onChangeRef.current(serializeToContent(nextFm, nextBody));
    },
    [],
  );

  const handleFmChange = useCallback((key: string, value: unknown) => {
    setFm(prev => {
      const next = { ...prev, [key]: value };
      emitChange(next, body);
      return next;
    });
  }, [body, emitChange]);

  const handleBodyChange = useCallback((val: string) => {
    setBody(val);
    emitChange(fm, val);
  }, [fm, emitChange]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onOpenSourceFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onOpenSourceFile]);

  const type = asString(fm.type).toLowerCase();
  const displayName = filePath.replace(/^\.planning\//, '');
  const typeOptions = Object.keys(METAFORM_CONFIG);
  const fields = METAFORM_CONFIG[type]?.fields ?? fallbackFields(fm);

  return (
    <div className="mfe-container">
      <div className="mfe-header">
        <span className="mfe-filename">
          {displayName}
          {isDirty && <span className="mfe-dirty"> *</span>}
        </span>
        <div className="mfe-header-actions">
          <select
            className="mfe-type-badge mfe-type-select"
            value={type || ''}
            onChange={e => handleFmChange('type', e.target.value)}
            title="Typ ändern"
          >
            {!type && <option value="">—</option>}
            {typeOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            className="editor-mode-btn"
            onClick={onOpenSourceFile}
            title="Zur Quelldatei (Alt+E)"
          >
            <FileCode size={14} />
            <span>Quelldatei</span>
          </button>
          <button
            className="editor-save-btn"
            onClick={onSave}
            disabled={!isDirty}
            title="Speichern (Ctrl+S)"
          >
            <Save size={14} />
          </button>
        </div>
      </div>

      <div className="mfe-body">
        <div className="mfe-form">
          {fields.map(field => (
            <MetaFormField key={field.key} field={field} fm={fm} onChange={handleFmChange} />
          ))}

          <div className="mfe-field mfe-field-notes">
            <label className="mfe-label">Notizen</label>
            <textarea
              className="mfe-textarea mfe-textarea-notes"
              value={body}
              onChange={e => handleBodyChange(e.target.value)}
              placeholder="Freie Notizen..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
