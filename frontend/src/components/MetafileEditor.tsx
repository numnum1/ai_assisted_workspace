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

// ── Ordered string list editor (reusable) ─────────────────────────────────────

function StringListEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (!v) return;
    onChange([...items, v]);
    setInput('');
  };

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const update = (i: number, val: string) => {
    const next = [...items];
    next[i] = val;
    onChange(next);
  };

  return (
    <div className="mfe-beat-list">
      {items.map((item, i) => (
        <div key={i} className="mfe-beat-row">
          <span className="mfe-list-index">{i + 1}.</span>
          <input
            className="mfe-input mfe-beat-input"
            value={item}
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
          placeholder={placeholder}
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

const HIDDEN_FIELDS = new Set(['type', 'id']);

function BookForm({
  fm,
  onFmChange,
}: {
  fm: Record<string, unknown>;
  onFmChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div className="mfe-field">
        <label className="mfe-label">Name</label>
        <input
          className="mfe-input"
          value={asString(fm.name)}
          onChange={e => onFmChange('name', e.target.value)}
          placeholder="Titel des Buches"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Universum</label>
        <input
          className="mfe-input"
          value={asString(fm.universum)}
          onChange={e => onFmChange('universum', e.target.value)}
          placeholder="z.B. Overlord, eigenes Universum..."
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Zeitliche Einordnung</label>
        <input
          className="mfe-input"
          value={asString(fm.zeitliche_einordnung)}
          onChange={e => onFmChange('zeitliche_einordnung', e.target.value)}
          placeholder="z.B. Nach Light Novel 3"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Beschreibung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.beschreibung)}
          onChange={e => onFmChange('beschreibung', e.target.value)}
          rows={4}
          placeholder="Worum geht es in diesem Buch?"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Kapitelreihenfolge</label>
        <StringListEditor
          items={asStringArray(fm.kapitel_ordnung)}
          placeholder="Kapitelname hinzufügen..."
          onChange={items => onFmChange('kapitel_ordnung', items)}
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
          value={asString(fm.zusammenfassung)}
          onChange={e => onFmChange('zusammenfassung', e.target.value)}
          rows={4}
          placeholder="Was passiert in diesem Kapitel?"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Szenenreihenfolge</label>
        <StringListEditor
          items={asStringArray(fm.szenen_ordnung)}
          placeholder="Szenenname hinzufügen..."
          onChange={items => onFmChange('szenen_ordnung', items)}
        />
      </div>
    </>
  );
}

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
          value={asString(fm.zusammenfassung)}
          onChange={e => onFmChange('zusammenfassung', e.target.value)}
          rows={4}
          placeholder="Was passiert in dieser Szene?"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Aktionsreihenfolge</label>
        <StringListEditor
          items={asStringArray(fm.aktionen_ordnung)}
          placeholder="Aktionsname hinzufügen..."
          onChange={items => onFmChange('aktionen_ordnung', items)}
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
          placeholder="Bezeichnung der Aktion"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Ort</label>
        <input
          className="mfe-input"
          value={asString(fm.ort)}
          onChange={e => onFmChange('ort', e.target.value)}
          placeholder="Wo findet die Aktion statt?"
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
        <label className="mfe-label">Was passiert</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.was_passiert)}
          onChange={e => onFmChange('was_passiert', e.target.value)}
          rows={3}
          placeholder="Was geschieht in dieser Aktion?"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Ziel</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.ziel)}
          onChange={e => onFmChange('ziel', e.target.value)}
          rows={2}
          placeholder="Was soll diese Aktion narrativ erreichen?"
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
          placeholder="Arcname"
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Thema</label>
        <input
          className="mfe-input"
          value={asString(fm.thema)}
          onChange={e => onFmChange('thema', e.target.value)}
          placeholder="Zentrales Thema des Arcs..."
        />
      </div>
      <div className="mfe-field">
        <label className="mfe-label">Zusammenfassung</label>
        <textarea
          className="mfe-textarea"
          value={asString(fm.zusammenfassung)}
          onChange={e => onFmChange('zusammenfassung', e.target.value)}
          rows={4}
          placeholder="Kurze Beschreibung des Arcs..."
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
      {Object.entries(fm)
        .filter(([key]) => !HIDDEN_FIELDS.has(key))
        .map(([key, val]) => (
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
          {type === 'book'    && <BookForm    fm={fm} onFmChange={handleFmChange} />}
          {type === 'chapter' && <ChapterForm fm={fm} onFmChange={handleFmChange} />}
          {type === 'scene'   && <SceneForm   fm={fm} onFmChange={handleFmChange} />}
          {type === 'action'  && <ActionForm  fm={fm} onFmChange={handleFmChange} />}
          {type === 'arc'     && <ArcForm     fm={fm} onFmChange={handleFmChange} />}
          {!['book', 'chapter', 'scene', 'action', 'arc'].includes(type) && (
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
