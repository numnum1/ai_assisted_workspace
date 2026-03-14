import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Loader, RefreshCw, BookOpen, GripVertical } from 'lucide-react';
import { glossaryApi } from '../api.ts';
import type { GlossaryEntry } from '../types.ts';

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 520;

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

  // Floating window position — start near top-right with some margin
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
          <button className="glp-icon-btn" onClick={loadEntries} title="Aktualisieren" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'glp-spin' : ''} />
          </button>
          <button className="glp-icon-btn" onClick={onClose} title="Schließen (Esc)">
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
          <button className="glp-search-clear" onClick={() => setSearch('')} title="Löschen">
            <X size={10} />
          </button>
        )}
      </div>

      <div className="glp-content">
        {loading && (
          <div className="glp-empty">
            <Loader size={16} className="glp-spin" />
            <span>Lade Glossar...</span>
          </div>
        )}
        {error && <div className="glp-error">{error}</div>}
        {!loading && !error && sorted.length === 0 && (
          <div className="glp-empty">
            {search ? 'Keine Treffer.' : 'Noch keine Einträge. Erstelle .md-Dateien in .glossary/.'}
          </div>
        )}
        {!loading && !error && sorted.length > 0 && (
          <div className="glp-list">
            {sorted.map(entry => (
              <button
                key={entry.path}
                className="glp-entry"
                onClick={() => onOpenFile(entry.path)}
                title={entry.path}
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
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
