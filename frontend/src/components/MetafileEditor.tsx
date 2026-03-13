import { useState, useEffect, useCallback, useRef } from 'react';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Save, FileCode, Plus, X } from 'lucide-react';

interface MetafileEditorProps {
  content: string;
  filePath: string;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onOpenSourceFile: () => void;
}

const STATUS_OPTIONS = ['draft', 'written', 'revised', 'final'];

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

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString);
  return [];
}

// ── Beat list editor ──────────────────────────────────────────────────────────

function BeatListEditor({
  beats,
  onChange,
}: {
  beats: string[];
  onChange: (beats: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (!v) return;
    onChange([...beats, v]);
    setInput('');
  };

  const remove = (i: number) => onChange(beats.filter((_, idx) => idx !== i));

  const update = (i: number, val: string) => {
    const next = [...beats];
    next[i] = val;
    onChange(next);
  };

  return (
    <div className="mfe-beat-list">
      {beats.map((beat, i) => (
        <div key={i} className="mfe-beat-row">
          <input
            className="mfe-input mfe-beat-input"
            value={beat}
            onChange={e => update(i, e.target.value)}
          />
          <button className="mfe-beat-remove" onClick={() => remove(i)} title="Entfernen">
            <X size={11} />
          </button>
        </div>
      ))}
      <div className="mfe-beat-add-row">
        <input
          className="mfe-input mfe-beat-input"
          placeholder="Neue Handlungseinheit..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button
          className="mfe-beat-add-btn"
          onClick={add}
          disabled={!input.trim()}
          title="Hinzufügen"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Type-specific form sections ───────────────────────────────────────────────

function SceneForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="mfe-field">
        <label className="mfe-label">Titel</label>
        <input
          className="mfe-input"
          value={asString(fm.title)}
          onChange={e => onFmChange('title', e.target.value)}
          placeholder="Szenenname"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Status</label>
        <select
          className="mfe-select"
          value={asString(fm.status) || 'draft'}
          onChange={e => onFmChange('status', e.target.value)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Zusammenfassung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.summary)}
          onChange={e => onFmChange('summary', e.target.value)}
          rows={3}
          placeholder="Kurze Beschreibung der Szene..."
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Handlungseinheiten</label>
        <BeatListEditor
          beats={asStringArray(fm.beats)}
          onChange={beats => onFmChange('beats', beats)}
        />
      </div>
    </>
  );
}

function ChapterForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="mfe-field">
        <label className="mfe-label">Titel</label>
        <input
          className="mfe-input"
          value={asString(fm.title)}
          onChange={e => onFmChange('title', e.target.value)}
          placeholder="Kapitelname"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Status</label>
        <select
          className="mfe-select"
          value={asString(fm.status) || 'draft'}
          onChange={e => onFmChange('status', e.target.value)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Zusammenfassung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.summary)}
          onChange={e => onFmChange('summary', e.target.value)}
          rows={3}
          placeholder="Kurze Beschreibung des Kapitels..."
        />
      </div>
    </>
  );
}

function ArcForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="mfe-field">
        <label className="mfe-label">Titel</label>
        <input
          className="mfe-input"
          value={asString(fm.title)}
          onChange={e => onFmChange('title', e.target.value)}
          placeholder="Arkname"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Thema</label>
        <input
          className="mfe-input"
          value={asString(fm.thema)}
          onChange={e => onFmChange('thema', e.target.value)}
          placeholder="Zentrales Thema des Arks..."
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Zusammenfassung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.summary)}
          onChange={e => onFmChange('summary', e.target.value)}
          rows={3}
          placeholder="Kurze Beschreibung des Arks..."
        />
      </div>
    </>
  );
}

function ActionForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="mfe-field">
        <label className="mfe-label">Titel</label>
        <input
          className="mfe-input"
          value={asString(fm.title)}
          onChange={e => onFmChange('title', e.target.value)}
          placeholder="Bezeichnung der Handlungseinheit"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Charakter</label>
        <input
          className="mfe-input"
          value={asString(fm.character)}
          onChange={e => onFmChange('character', e.target.value)}
          placeholder="Wer handelt?"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Beschreibung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.summary)}
          onChange={e => onFmChange('summary', e.target.value)}
          rows={3}
          placeholder="Was passiert in dieser Handlungseinheit?"
        />
      </div>
    </>
  );
}

function FallbackForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      {Object.entries(fm).map(([key, val]) => (
        <div key={key} className="mfe-field">
          <label className="mfe-label">{key}</label>
          <input
            className="mfe-input"
            value={asString(val)}
            onChange={e => onFmChange(key, e.target.value)}
          />
        </div>
      ))}
    </>
  );
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

  const TYPE_OPTIONS = ['book', 'chapter', 'scene', 'action', 'arc'];

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
            {TYPE_OPTIONS.map(t => (
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
          {type === 'book' && (
            <FallbackForm fm={fm} onFmChange={handleFmChange} />
          )}
          {type === 'chapter' && (
            <ChapterForm fm={fm} onFmChange={handleFmChange} />
          )}
          {type === 'scene' && (
            <SceneForm fm={fm} onFmChange={handleFmChange} />
          )}
          {type === 'action' && (
            <ActionForm fm={fm} onFmChange={handleFmChange} />
          )}
          {type === 'arc' && (
            <ArcForm fm={fm} onFmChange={handleFmChange} />
          )}
          {type !== 'book' && type !== 'chapter' && type !== 'scene' && type !== 'action' && type !== 'arc' && (
            <FallbackForm fm={fm} onFmChange={handleFmChange} />
          )}

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
