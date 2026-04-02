import { useEffect, useState, useCallback } from 'react';
import { X, Folder, FileText, ChevronRight, ChevronDown, StickyNote, Loader2, Trash2, Copy, Check, BookMarked } from 'lucide-react';
import type { WikiState } from '../../hooks/useWiki.ts';
import type { WikiEntry, WikiType, NoteProposal, GlossaryEntry } from '../../types.ts';
import { notesApi, glossaryApi } from '../../api.ts';

interface WikiBrowserProps {
  wiki: WikiState;
  onClose: () => void;
}

type ActiveTab = 'wiki' | 'notes' | 'glossary';

type ContextMenuTarget =
  | { kind: 'root-empty'; x: number; y: number }
  | { kind: 'folder'; x: number; y: number; typeId: string }
  | { kind: 'type-empty'; x: number; y: number }
  | { kind: 'entry'; x: number; y: number; typeId: string; entryId: string };

export function WikiBrowser({ wiki, onClose }: WikiBrowserProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('wiki');
  const [freeNotes, setFreeNotes] = useState<NoteProposal[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [openedNote, setOpenedNote] = useState<NoteProposal | null>(null);
  const [freeNoteCopied, setFreeNoteCopied] = useState(false);
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([]);
  const [glossaryLoading, setGlossaryLoading] = useState(false);
  const [glossaryExpanded, setGlossaryExpanded] = useState<Set<string>>(new Set());
  const [glossaryEditingId, setGlossaryEditingId] = useState<string | null>(null);
  const [glossaryEditTerm, setGlossaryEditTerm] = useState('');
  const [glossaryEditDef, setGlossaryEditDef] = useState('');
  const [glossaryManualOpen, setGlossaryManualOpen] = useState(false);
  const [glossaryManualTerm, setGlossaryManualTerm] = useState('');
  const [glossaryManualDef, setGlossaryManualDef] = useState('');

  useEffect(() => {
    setFreeNoteCopied(false);
  }, [openedNote?.id]);

  useEffect(() => {
    wiki.loadTypes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFreeNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await notesApi.listFree();
      setFreeNotes(data);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const loadGlossary = useCallback(async () => {
    setGlossaryLoading(true);
    try {
      const data = await glossaryApi.list();
      setGlossaryEntries(data);
    } finally {
      setGlossaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'notes') {
      loadFreeNotes();
    }
  }, [activeTab, loadFreeNotes]);

  useEffect(() => {
    if (activeTab === 'glossary') {
      void loadGlossary();
    }
  }, [activeTab, loadGlossary]);

  const handleDeleteFreeNote = useCallback(async (id: string) => {
    await notesApi.deleteFree(id);
    setFreeNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleCreateType = useCallback(() => {
    setContextMenu(null);
    wiki.openTypePicker();
  }, [wiki]);

  const handleDeleteType = useCallback(async (typeId: string) => {
    setContextMenu(null);
    const type = wiki.types.find(t => t.id === typeId);
    if (!window.confirm(`Typ "${type?.name}" und alle Einträge löschen?`)) return;
    await wiki.deleteType(typeId);
  }, [wiki]);

  const handleCreateEntry = useCallback(async () => {
    setContextMenu(null);
    if (!wiki.currentType) return;
    const name = window.prompt(`Name des neuen ${wiki.currentType.name}:`);
    if (!name?.trim()) return;
    await wiki.createEntry(name.trim());
  }, [wiki]);

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    setContextMenu(null);
    if (!window.confirm('Eintrag löschen?')) return;
    await wiki.deleteEntry(entryId);
  }, [wiki]);

  const entryDisplayName = (entry: WikiEntry) =>
    entry.values['name'] || entry.values['title'] || entry.id;

  return (
    <div className="wiki-browser-overlay">
      <div
        className="wiki-browser-panel"
      >
        {/* Header */}
        <div className="wiki-browser-header">
          {activeTab === 'wiki' ? (
            <div className="wiki-browser-breadcrumb">
              <span
                className={`wiki-browser-breadcrumb-item${wiki.currentType ? ' clickable' : ' active'}`}
                onClick={wiki.currentType ? wiki.goBack : undefined}
              >
                Wiki
              </span>
              {wiki.currentType && (
                <>
                  <ChevronRight size={13} className="wiki-browser-breadcrumb-sep" />
                  <span className="wiki-browser-breadcrumb-item active">
                    {wiki.currentType.name}
                  </span>
                </>
              )}
            </div>
          ) : activeTab === 'notes' ? (
            <div className="wiki-browser-breadcrumb">
              <StickyNote size={13} className="wiki-browser-breadcrumb-sep" />
              <span className="wiki-browser-breadcrumb-item active">Notizen</span>
            </div>
          ) : (
            <div className="wiki-browser-breadcrumb">
              <BookMarked size={13} className="wiki-browser-breadcrumb-sep" />
              <span className="wiki-browser-breadcrumb-item active">Glossar</span>
            </div>
          )}
          <button className="wiki-browser-close" onClick={onClose} title="Schließen">
            <X size={15} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="wiki-browser-tabs">
          <button
            className={`wiki-browser-tab${activeTab === 'wiki' ? ' wiki-browser-tab--active' : ''}`}
            onClick={() => setActiveTab('wiki')}
          >
            Wiki
          </button>
          <button
            className={`wiki-browser-tab${activeTab === 'notes' ? ' wiki-browser-tab--active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Notizen
          </button>
          <button
            className={`wiki-browser-tab${activeTab === 'glossary' ? ' wiki-browser-tab--active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            Glossar
          </button>
        </div>

        {/* Content */}
        {activeTab === 'wiki' ? (
          <div
            className="wiki-browser-content"
            onContextMenu={e => {
              const isItem = (e.target as HTMLElement).closest('.wiki-browser-item');
              if (!isItem) {
                e.preventDefault();
                if (wiki.currentType) {
                  setContextMenu({ kind: 'type-empty', x: e.clientX, y: e.clientY });
                } else {
                  setContextMenu({ kind: 'root-empty', x: e.clientX, y: e.clientY });
                }
              }
            }}
          >
            {!wiki.currentType ? (
              /* Root view: Type folders */
              <>
                {wiki.types.length === 0 && (
                  <div className="wiki-browser-empty">
                    Rechtsklick um einen Wiki-Typ zu erstellen
                  </div>
                )}
                <div className="wiki-browser-grid">
                  {wiki.types.map((type: WikiType) => (
                    <div
                      key={type.id}
                      className="wiki-browser-item wiki-browser-type-item"
                      onDoubleClick={() => wiki.enterType(type.id)}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ kind: 'folder', x: e.clientX, y: e.clientY, typeId: type.id });
                      }}
                      title={`${type.name} – Doppelklick zum Öffnen`}
                    >
                      <Folder size={32} className="wiki-browser-item-icon" />
                      <span className="wiki-browser-item-name">{type.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* Type view: Entry list */
              <>
                {wiki.entries.length === 0 && (
                  <div className="wiki-browser-empty">
                    Rechtsklick um einen neuen {wiki.currentType.name} zu erstellen
                  </div>
                )}
                <div className="wiki-browser-grid">
                  {wiki.entries.map((entry: WikiEntry) => (
                    <div
                      key={entry.id}
                      className="wiki-browser-item wiki-browser-entry-item"
                      onClick={() => wiki.openEntry(entry)}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ kind: 'entry', x: e.clientX, y: e.clientY, typeId: entry.typeId, entryId: entry.id });
                      }}
                      title={entryDisplayName(entry)}
                    >
                      <FileText size={32} className="wiki-browser-item-icon" />
                      <span className="wiki-browser-item-name">{entryDisplayName(entry)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'notes' ? (
          /* Notes tab */
          <div className="wiki-browser-content free-notes-content">
            {notesLoading ? (
              <div className="wiki-browser-empty">
                <Loader2 size={18} className="free-notes-spinner" />
              </div>
            ) : freeNotes.length === 0 ? (
              <div className="wiki-browser-empty">
                Keine freien Notizen vorhanden
              </div>
            ) : (
              <div className="free-notes-grid">
                {freeNotes.map((note, i) => (
                  <div
                    key={note.id}
                    className={`free-note-sticky free-note-sticky--${(i % 4) + 1}`}
                    onClick={() => setOpenedNote(note)}
                    title="Klicken zum Öffnen"
                  >
                    <div className="free-note-sticky-title">{note.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Glossary tab */
          <div className="wiki-browser-content glossary-browser-content">
            <div className="glossary-browser-toolbar">
              <button
                type="button"
                className="glossary-browser-add-btn"
                onClick={() => {
                  setGlossaryManualOpen((o) => !o);
                  setGlossaryManualTerm('');
                  setGlossaryManualDef('');
                }}
              >
                {glossaryManualOpen ? 'Abbrechen' : 'Manuell hinzufügen'}
              </button>
            </div>
            {glossaryManualOpen && (
              <div className="glossary-acc-item" style={{ marginBottom: 8 }}>
                <div className="glossary-acc-body">
                  <div className="glossary-acc-edit-form">
                    <input
                      placeholder="Begriff"
                      value={glossaryManualTerm}
                      onChange={(e) => setGlossaryManualTerm(e.target.value)}
                    />
                    <textarea
                      placeholder="Beschreibung"
                      value={glossaryManualDef}
                      onChange={(e) => setGlossaryManualDef(e.target.value)}
                      rows={4}
                    />
                    <div className="glossary-acc-edit-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setGlossaryManualOpen(false);
                          setGlossaryManualTerm('');
                          setGlossaryManualDef('');
                        }}
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const t = glossaryManualTerm.trim();
                          const d = glossaryManualDef.trim();
                          if (!t || !d) return;
                          await glossaryApi.create({ term: t, definition: d });
                          setGlossaryManualOpen(false);
                          setGlossaryManualTerm('');
                          setGlossaryManualDef('');
                          await loadGlossary();
                        }}
                      >
                        Speichern
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {glossaryLoading ? (
              <div className="wiki-browser-empty">
                <Loader2 size={18} className="free-notes-spinner" />
              </div>
            ) : glossaryEntries.length === 0 ? (
              <div className="wiki-browser-empty">Keine Glossar-Einträge</div>
            ) : (
              glossaryEntries.map((e) => {
                const expanded = glossaryExpanded.has(e.id);
                const editing = glossaryEditingId === e.id;
                return (
                  <div key={e.id} className="glossary-acc-item">
                    <button
                      type="button"
                      className="glossary-acc-head"
                      onClick={() => {
                        setGlossaryExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(e.id)) next.delete(e.id);
                          else next.add(e.id);
                          return next;
                        });
                      }}
                    >
                      {expanded ? (
                        <ChevronDown size={16} className="glossary-acc-chevron" />
                      ) : (
                        <ChevronRight size={16} className="glossary-acc-chevron" />
                      )}
                      <span className="glossary-acc-title">{e.term}</span>
                    </button>
                    {expanded && (
                      <div className="glossary-acc-body">
                        {editing ? (
                          <div className="glossary-acc-edit-form">
                            <input
                              value={glossaryEditTerm}
                              onChange={(ev) => setGlossaryEditTerm(ev.target.value)}
                            />
                            <textarea
                              value={glossaryEditDef}
                              onChange={(ev) => setGlossaryEditDef(ev.target.value)}
                              rows={5}
                            />
                            <div className="glossary-acc-edit-actions">
                              <button type="button" onClick={() => setGlossaryEditingId(null)}>
                                Abbrechen
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await glossaryApi.update(e.id, {
                                    term: glossaryEditTerm.trim(),
                                    definition: glossaryEditDef.trim(),
                                  });
                                  setGlossaryEditingId(null);
                                  await loadGlossary();
                                }}
                              >
                                Speichern
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>{e.definition}</div>
                            <div className="glossary-acc-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setGlossaryEditingId(e.id);
                                  setGlossaryEditTerm(e.term);
                                  setGlossaryEditDef(e.definition);
                                }}
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                className="glossary-acc-delete"
                                onClick={async () => {
                                  if (!window.confirm(`Eintrag „${e.term}“ löschen?`)) return;
                                  await glossaryApi.delete(e.id);
                                  await loadGlossary();
                                }}
                              >
                                Löschen
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Note detail modal */}
      {openedNote && (
        <div className="free-note-modal-overlay" onClick={() => setOpenedNote(null)}>
          <div className="free-note-modal" onClick={e => e.stopPropagation()}>
            <div className="free-note-modal-header">
              <h3 className="free-note-modal-title">{openedNote.title}</h3>
              <div className="free-note-modal-actions">
                <button
                  type="button"
                  className="free-note-modal-copy"
                  title={freeNoteCopied ? 'Kopiert' : 'In Zwischenablage kopieren'}
                  onClick={async () => {
                    const text = `${openedNote.title}\n\n${openedNote.content}`;
                    try {
                      await navigator.clipboard.writeText(text);
                      setFreeNoteCopied(true);
                      setTimeout(() => setFreeNoteCopied(false), 2000);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {freeNoteCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  className="free-note-modal-delete"
                  title="Notiz löschen"
                  onClick={async () => {
                    await handleDeleteFreeNote(openedNote.id);
                    setOpenedNote(null);
                  }}
                >
                  <Trash2 size={14} />
                </button>
                <button type="button" className="free-note-modal-close" onClick={() => setOpenedNote(null)} title="Schließen">
                  <X size={15} />
                </button>
              </div>
            </div>
            {openedNote.createdAt && (
              <div className="free-note-modal-date">
                {new Date(openedNote.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            <div className="free-note-modal-content">{openedNote.content}</div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="tree-context-menu wiki-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.kind === 'root-empty' && (
            <div className="tree-context-menu-item" onClick={handleCreateType}>
              Neuer Wiki-Typ
            </div>
          )}
          {contextMenu.kind === 'folder' && (
            <>
              <div className="tree-context-menu-item" onClick={() => {
                setContextMenu(null);
                wiki.enterType(contextMenu.typeId);
              }}>
                Öffnen
              </div>
              <div className="tree-context-menu-item" onClick={() => {
                setContextMenu(null);
                wiki.openTypeEditor(contextMenu.typeId);
              }}>
                Typ bearbeiten
              </div>
              <div
                className="tree-context-menu-item tree-context-menu-item-danger"
                onClick={() => handleDeleteType(contextMenu.typeId)}
              >
                Typ löschen
              </div>
            </>
          )}
          {contextMenu.kind === 'type-empty' && wiki.currentType && (
            <div className="tree-context-menu-item" onClick={handleCreateEntry}>
              Neues {wiki.currentType.name}
            </div>
          )}
          {contextMenu.kind === 'entry' && (
            <div
              className="tree-context-menu-item tree-context-menu-item-danger"
              onClick={() => handleDeleteEntry(contextMenu.entryId)}
            >
              Eintrag löschen
            </div>
          )}
        </div>
      )}
    </div>
  );
}
