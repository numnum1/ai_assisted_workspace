import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Loader, RefreshCw, BookOpen, GripVertical, Plus, Trash2, Pencil } from 'lucide-react';
import { glossaryApi, filesApi } from '../../api.ts';
import type { GlossaryEntry } from '../../types.ts';

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 520;
const GLOSSARY_DIR = '.glossary';

function makeTemplate(name: string): string {
  return `---\ntype: term\nid: ${name}\nsummary: ""\naliases: ""\ntags: ""\n---\n`;
}

interface GlossaryPanelProps {
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

export function GlossaryPanel({ onOpenFile, onClose }: GlossaryPanelProps) {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - PANEL_WIDTH - 24,
    y: 60,
  }));
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - PANEL_WIDTH, ev.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dragOffset.current.y));
      setPos({ x, y });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await glossaryApi.getEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [loadEntries]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (creating) {
          setCreating(false);
          setNewName('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, creating]);

  useEffect(() => {
    if (creating) {
      setTimeout(() => createInputRef.current?.focus(), 30);
    }
  }, [creating]);

  const handleCreateConfirm = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName('');
      return;
    }
    const safeName = name.endsWith('.md') ? name : `${name}.md`;
    const path = `${GLOSSARY_DIR}/${safeName}`;
    const baseName = safeName.replace(/\.md$/, '');
    try {
      await filesApi.saveContent(path, makeTemplate(baseName));
      setCreating(false);
      setNewName('');
      await loadEntries();
      onOpenFile(path);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erstellen fehlgeschlagen.');
    }
  }, [newName, loadEntries, onOpenFile]);

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateConfirm();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setCreating(false);
      setNewName('');
    }
  };

  const handleDelete = useCallback(async (e: React.MouseEvent, entry: GlossaryEntry) => {
    e.stopPropagation();
    const name = entry.name;
    if (!window.confirm(`Begriff "${name}" wirklich löschen?`)) return;
    try {
      await filesApi.deleteContent(entry.path);
      await loadEntries();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }, [loadEntries]);

  const handleRename = useCallback(async (e: React.MouseEvent, entry: GlossaryEntry) => {
    e.stopPropagation();
    const currentBasename = entry.path.split('/').pop()?.replace(/\.md$/, '') ?? entry.name;
    const input = window.prompt('Neuer Name:', currentBasename);
    if (!input || input.trim() === '' || input.trim() === currentBasename) return;
    const newFileName = input.trim().endsWith('.md') ? input.trim() : `${input.trim()}.md`;
    try {
      await filesApi.rename(entry.path, newFileName);
      await loadEntries();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Umbenennen fehlgeschlagen.');
    }
  }, [loadEntries]);

  const filtered = entries.filter(entry => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      (entry.summary ?? '').toLowerCase().includes(q) ||
      (entry.aliases ?? '').toLowerCase().includes(q) ||
      (entry.tags ?? '').toLowerCase().includes(q)
    );
  });

  const sorted = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      className="glp-panel"
      style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH, height: PANEL_HEIGHT }}
    >
      <div className="glp-header" onMouseDown={handleDragStart}>
        <GripVertical size={13} className="glp-drag-icon" />
        <BookOpen size={13} className="glp-header-icon" />
        <span className="glp-title">Glossar</span>
        <div className="glp-header-actions">
          <button
            type="button"
            className="glp-icon-btn"
            onClick={() => { setCreating(true); setNewName(''); }}
            title="Neuen Begriff erstellen"
            disabled={creating}
          >
            <Plus size={13} />
          </button>
          <button type="button" className="glp-icon-btn" onClick={loadEntries} title="Aktualisieren" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'glp-spin' : ''} />
          </button>
          <button type="button" className="glp-icon-btn" onClick={onClose} title="Schließen (Esc)">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="glp-search-wrap">
        <Search size={12} className="glp-search-icon" />
        <input
          ref={searchRef}
          className="glp-search"
          placeholder="Begriff suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="glp-search-clear" onClick={() => setSearch('')} title="Löschen">
            <X size={10} />
          </button>
        )}
      </div>

      <div className="glp-content">
        {creating && (
          <div className="glp-create-row">
            <input
              ref={createInputRef}
              className="glp-create-input"
              placeholder="Name des Begriffs..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              onBlur={handleCreateConfirm}
            />
          </div>
        )}

        {loading && (
          <div className="glp-empty">
            <Loader size={16} className="glp-spin" />
            <span>Lade Glossar...</span>
          </div>
        )}
        {error && <div className="glp-error">{error}</div>}
        {!loading && !error && sorted.length === 0 && (
          <div className="glp-empty">
            {search
              ? 'Keine Treffer.'
              : 'Noch keine Einträge. Klicke + um einen Begriff zu erstellen.'}
          </div>
        )}
        {!loading && !error && sorted.length > 0 && (
          <div className="glp-list">
            {sorted.map(entry => (
              <div
                key={entry.path}
                className="glp-entry"
                onClick={() => onOpenFile(entry.path)}
                title={entry.path}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onOpenFile(entry.path); }}
              >
                <div className="glp-entry-header">
                  <span className="glp-entry-name">{entry.name}</span>
                  {entry.type && (
                    <span className="glp-entry-type">{entry.type}</span>
                  )}
                </div>
                {entry.summary && (
                  <p className="glp-entry-summary">{entry.summary}</p>
                )}
                {entry.aliases && (
                  <p className="glp-entry-aliases">{entry.aliases}</p>
                )}
                <div className="glp-entry-actions">
                  <button
                    type="button"
                    className="glp-entry-action-btn"
                    title="Umbenennen"
                    onClick={e => handleRename(e, entry)}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    className="glp-entry-action-btn glp-entry-action-btn-danger"
                    title="Löschen"
                    onClick={e => handleDelete(e, entry)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
