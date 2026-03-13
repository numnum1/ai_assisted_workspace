import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Loader, RefreshCw, User, MapPin, Building2, FileText } from 'lucide-react';
import { wikiApi } from '../api.ts';
import type { WikiEntry } from '../types.ts';

interface ContentBrowserProps {
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  character: <User size={12} />,
  location:  <MapPin size={12} />,
  organization: <Building2 size={12} />,
};

const TYPE_LABELS: Record<string, string> = {
  character: 'Character',
  location: 'Location',
  organization: 'Organization',
};

const MIN_HEIGHT = 180;
const DEFAULT_HEIGHT = 300;
const MAX_HEIGHT = 600;

export function ContentBrowser({ onOpenFile, onClose }: ContentBrowserProps) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(DEFAULT_HEIGHT);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await wikiApi.getEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wiki entries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Drag-to-resize handle
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startYRef.current - ev.clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
      setHeight(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height]);

  const availableTypes = Array.from(new Set(entries.map(e => e.type).filter(Boolean))) as string[];

  const filtered = entries.filter(entry => {
    if (typeFilter && entry.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      (entry.summary ?? '').toLowerCase().includes(q) ||
      (entry.aliases ?? '').toLowerCase().includes(q) ||
      (entry.tags ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="cb-panel" style={{ height }}>
      {/* Drag handle */}
      <div className="cb-drag-handle" onMouseDown={handleDragStart} title="Drag to resize" />

      {/* Header */}
      <div className="cb-header">
        <span className="cb-title">Wiki</span>

        <div className="cb-search-wrap">
          <Search size={13} className="cb-search-icon" />
          <input
            className="cb-search"
            placeholder="Search entries..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="cb-search-clear" onClick={() => setSearch('')} title="Clear">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="cb-filters">
          <button
            className={`cb-filter-btn ${typeFilter === null ? 'active' : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            All
          </button>
          {availableTypes.map(t => (
            <button
              key={t}
              className={`cb-filter-btn ${typeFilter === t ? 'active' : ''}`}
              onClick={() => setTypeFilter(prev => prev === t ? null : t)}
            >
              {TYPE_ICONS[t] ?? <FileText size={12} />}
              {TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        <div className="cb-header-actions">
          <button className="cb-icon-btn" onClick={loadEntries} title="Refresh" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'cb-spin' : ''} />
          </button>
          <button className="cb-icon-btn" onClick={onClose} title="Close (Shift+Space)">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="cb-content">
        {loading && (
          <div className="cb-empty">
            <Loader size={16} className="cb-spin" />
            <span>Loading wiki...</span>
          </div>
        )}
        {error && <div className="cb-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="cb-empty">
            {entries.length === 0
              ? 'No wiki entries found. Create .md files in .wiki/ to get started.'
              : 'No entries match your search.'
            }
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="cb-grid">
            {filtered.map(entry => (
              <button
                key={entry.path}
                className="cb-card"
                onClick={() => onOpenFile(entry.path)}
                title={entry.path}
              >
                <div className="cb-card-header">
                  <span className="cb-card-name">{entry.name}</span>
                  {entry.type && (
                    <span className="cb-card-type">
                      {TYPE_ICONS[entry.type] ?? <FileText size={11} />}
                      {TYPE_LABELS[entry.type] ?? entry.type}
                    </span>
                  )}
                </div>
                {entry.summary && (
                  <p className="cb-card-summary">{entry.summary}</p>
                )}
                {!entry.summary && (
                  <p className="cb-card-summary cb-card-summary-empty">No summary</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
