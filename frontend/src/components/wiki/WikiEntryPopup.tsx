import { useEffect, useState, useCallback, useRef } from 'react';
import { StickyNote, Trash2, Copy, Check, Save, X, LayoutList, Braces } from 'lucide-react';
import type { EditingWikiEntry } from '../../hooks/useWiki.ts';
import type { MetaTypeSchema } from '../../meta/metaSchema.ts';
import type { NoteProposal } from '../../types.ts';
import { AssetPanel } from '../meta/AssetPanel.tsx';
import { notesApi } from '../../api.ts';

type EntryMode = 'fields' | 'json';

interface WikiEntryPopupProps {
  editing: EditingWikiEntry;
  onSave: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

function wikiTypeToSchema(editing: EditingWikiEntry): MetaTypeSchema {
  return {
    filename: editing.type.name,
    fields: editing.type.fields.map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      placeholder: f.placeholder,
      defaultValue: f.defaultValue,
      config: f.config,
    })),
  };
}

function parseAndValidateJson(text: string): Record<string, string> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Ungültiges JSON.';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'JSON muss ein Objekt sein (kein Array, kein primitiver Wert).';
  }
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      return `Wert für Schlüssel "${k}" muss ein String sein.`;
    }
  }
  return parsed as Record<string, string>;
}

export function WikiEntryPopup({ editing, onSave, onClose }: WikiEntryPopupProps) {
  const [mode, setMode] = useState<EntryMode>('fields');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteProposal[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await notesApi.listForEntry(editing.type.id, editing.entry.id);
      setNotes(data);
    } catch {
      /* wiki notes dir may not exist yet — silently ignore */
    } finally {
      setNotesLoading(false);
    }
  }, [editing.type.id, editing.entry.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // When entry changes from outside, reset mode to fields
  useEffect(() => {
    setMode('fields');
    setJsonText('');
    setJsonError(null);
  }, [editing.entry.id]);

  const switchToJson = useCallback(() => {
    setJsonText(JSON.stringify(editing.entry.values, null, 2));
    setJsonError(null);
    setMode('json');
  }, [editing.entry.values]);

  const switchToFields = useCallback(() => {
    const result = parseAndValidateJson(jsonText);
    if (typeof result === 'string') {
      setJsonError(result);
      return;
    }
    setJsonError(null);
    setMode('fields');
  }, [jsonText]);

  const handleJsonSave = useCallback(async () => {
    const result = parseAndValidateJson(jsonText);
    if (typeof result === 'string') {
      setJsonError(result);
      return;
    }
    setJsonError(null);
    await onSave(result);
  }, [jsonText, onSave]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await notesApi.deleteFromEntry(editing.type.id, editing.entry.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      /* ignore */
    }
  }, [editing.type.id, editing.entry.id]);

  const handleCopyNote = useCallback(async (note: NoteProposal) => {
    const text = `${note.title}\n\n${note.content}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNoteId(note.id);
      setTimeout(() => setCopiedNoteId((id) => (id === note.id ? null : id)), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const schema = wikiTypeToSchema(editing);
  const entryName = editing.entry.values['name'] || editing.entry.values['title'] || editing.entry.id;

  const mouseDownOnOverlay = useRef(false);

  return (
    <div
      className="wiki-entry-popup-overlay"
      onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="wiki-entry-popup" onMouseDown={e => e.stopPropagation()}>
        <div className="wiki-entry-popup-header">
          <div className="wiki-entry-popup-type-label">{editing.type.name}</div>
          <div className="wiki-entry-mode-toggle">
            <button
              type="button"
              className={`wiki-entry-mode-btn${mode === 'fields' ? ' wiki-entry-mode-btn--active' : ''}`}
              onClick={mode === 'json' ? switchToFields : undefined}
              title="Felder-Modus"
            >
              <LayoutList size={13} />
              Felder
            </button>
            <button
              type="button"
              className={`wiki-entry-mode-btn${mode === 'json' ? ' wiki-entry-mode-btn--active' : ''}`}
              onClick={mode === 'fields' ? switchToJson : undefined}
              title="JSON-Modus"
            >
              <Braces size={13} />
              JSON
            </button>
          </div>
        </div>

        {mode === 'fields' ? (
          <AssetPanel
            schema={schema}
            values={editing.entry.values}
            title={entryName}
            onSave={onSave}
            onClose={onClose}
          />
        ) : (
          <div className="wiki-json-editor">
            <div className="meta-panel-header">
              <span className="meta-panel-filename">{entryName}</span>
              <div className="meta-panel-header-actions">
                <button className="meta-panel-save-btn" onClick={handleJsonSave} title="Speichern">
                  <Save size={13} />
                </button>
                <button className="meta-panel-close-btn" onClick={onClose} title="Schließen">
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="wiki-json-editor-body">
              <textarea
                className="wiki-json-textarea"
                value={jsonText}
                onChange={e => { setJsonText(e.target.value); setJsonError(null); }}
                spellCheck={false}
              />
              {jsonError && <div className="wiki-json-error">{jsonError}</div>}
              <button className="meta-panel-save-full-btn" onClick={handleJsonSave}>
                <Save size={13} />
                Speichern
              </button>
            </div>
          </div>
        )}

        {(notes.length > 0 || notesLoading) && (
          <div className="wiki-entry-notes">
            <div className="wiki-entry-notes-header">
              <StickyNote size={12} />
              <span>Notizen</span>
            </div>
            {notesLoading ? (
              <div className="wiki-entry-notes-loading">Lade...</div>
            ) : (
              <div className="wiki-entry-notes-list">
                {notes.map((note) => (
                  <div key={note.id} className="wiki-entry-note-item">
                    <div className="wiki-entry-note-title">{note.title}</div>
                    <div className="wiki-entry-note-content">{note.content}</div>
                    <div className="wiki-entry-note-actions">
                      <button
                        type="button"
                        className="wiki-entry-note-copy"
                        onClick={() => handleCopyNote(note)}
                        title={copiedNoteId === note.id ? 'Kopiert' : 'In Zwischenablage kopieren'}
                      >
                        {copiedNoteId === note.id ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                      <button
                        type="button"
                        className="wiki-entry-note-delete"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Notiz löschen"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
