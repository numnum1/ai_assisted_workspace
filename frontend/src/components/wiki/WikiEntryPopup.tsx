import { useEffect, useState, useCallback } from 'react';
import { StickyNote, Trash2, Copy, Check } from 'lucide-react';
import type { EditingWikiEntry } from '../../hooks/useWiki.ts';
import type { MetaTypeSchema } from '../../meta/metaSchema.ts';
import type { NoteProposal } from '../../types.ts';
import { AssetPanel } from '../meta/AssetPanel.tsx';
import { notesApi } from '../../api.ts';

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

export function WikiEntryPopup({ editing, onSave, onClose }: WikiEntryPopupProps) {
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

  return (
    <div className="wiki-entry-popup-overlay" onClick={onClose}>
      <div className="wiki-entry-popup" onClick={e => e.stopPropagation()}>
        <div className="wiki-entry-popup-type-label">{editing.type.name}</div>
        <AssetPanel
          schema={schema}
          values={editing.entry.values}
          title={entryName}
          onSave={onSave}
          onClose={onClose}
        />
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
