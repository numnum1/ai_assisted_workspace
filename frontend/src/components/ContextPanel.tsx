import { useState, useEffect, useCallback, useRef } from 'react';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Save } from 'lucide-react';
import { METAFORM_CONFIG, FIELD_RENDERERS, HIDDEN_FIELDS, type FieldConfig } from './metaformConfig.tsx';
import { filesApi } from '../api';

// ── Frontmatter helpers ───────────────────────────────────────────────────────

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

// ── ContextPanel ──────────────────────────────────────────────────────────────

interface ContextPanelProps {
  activeMetafilePath: string | null;
}

export function ContextPanel({ activeMetafilePath }: ContextPanelProps) {
  const [fm, setFm] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Refs to access current values inside async/cleanup callbacks
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const currentContentRef = useRef('');
  const loadedPathRef = useRef<string | null>(null);

  // Keep serialized content in sync with form state
  const updateContent = useCallback((nextFm: Record<string, unknown>, nextBody: string) => {
    currentContentRef.current = serializeToContent(nextFm, nextBody);
  }, []);

  // Load metafile, auto-saving the previous one if dirty
  useEffect(() => {
    const prevPath = loadedPathRef.current;

    // Auto-save previous scene's notes before switching
    if (prevPath && isDirtyRef.current) {
      filesApi.saveContent(prevPath, currentContentRef.current).catch(console.error);
    }

    loadedPathRef.current = activeMetafilePath;

    if (!activeMetafilePath) {
      setFm({});
      setBody('');
      setIsDirty(false);
      setNotFound(false);
      currentContentRef.current = '';
      return;
    }

    setLoading(true);
    setNotFound(false);

    filesApi.getContent(activeMetafilePath)
      .then(data => {
        const { fm: parsedFm, body: parsedBody } = splitFrontmatter(data.content);
        setFm(parsedFm);
        setBody(parsedBody);
        setIsDirty(false);
        currentContentRef.current = data.content;
      })
      .catch(() => {
        setFm({});
        setBody('');
        setIsDirty(false);
        setNotFound(true);
        currentContentRef.current = '';
      })
      .finally(() => setLoading(false));
  }, [activeMetafilePath]);

  const handleFmChange = useCallback((key: string, value: unknown) => {
    setFm(prev => {
      const next = { ...prev, [key]: value };
      updateContent(next, body);
      setIsDirty(true);
      return next;
    });
  }, [body, updateContent]);

  const handleBodyChange = useCallback((val: string) => {
    setBody(val);
    setFm(prev => {
      updateContent(prev, val);
      return prev;
    });
    setIsDirty(true);
  }, [updateContent]);

  const handleSave = useCallback(async () => {
    if (!activeMetafilePath || !isDirty) return;
    try {
      await filesApi.saveContent(activeMetafilePath, currentContentRef.current);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to save metafile:', err);
    }
  }, [activeMetafilePath, isDirty]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!activeMetafilePath) {
    return (
      <div className="ctx-panel ctx-panel-empty">
        <p>Setze den Cursor in eine Szene</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ctx-panel ctx-panel-empty">
        <p>Lade...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="ctx-panel ctx-panel-empty">
        <p>Szene nicht in Planung</p>
        <span className="ctx-panel-hint">{activeMetafilePath}</span>
      </div>
    );
  }

  const type = asString(fm.type).toLowerCase();
  const fields = METAFORM_CONFIG[type]?.fields ?? fallbackFields(fm);

  return (
    <div className="ctx-panel">
      <div className="ctx-panel-header">
        <span className="ctx-panel-title">
          {asString(fm.title || fm.name) || type || 'Szene'}
          {isDirty && <span className="ctx-panel-dirty"> *</span>}
        </span>
        <button
          className="editor-save-btn"
          onClick={handleSave}
          disabled={!isDirty}
          title="Speichern (Ctrl+S)"
        >
          <Save size={14} />
        </button>
      </div>

      <div className="ctx-panel-body">
        <div className="mfe-form">
          {fields.map(field => {
            const value = asString(fm[field.key]);
            return (
              <div key={field.key}>
                {FIELD_RENDERERS[field.type]({
                  field,
                  value,
                  onChange: v => handleFmChange(field.key, v),
                })}
              </div>
            );
          })}

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
