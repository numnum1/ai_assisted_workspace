import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Loader, RefreshCw, User, MapPin, Building2, FileText, Folder, ChevronLeft } from 'lucide-react';
import { wikiApi } from '../api.ts';
import type { WikiEntry } from '../types.ts';

interface ContentBrowserProps {
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  character: <User size={14} />,
  location:  <MapPin size={14} />,
  organization: <Building2 size={14} />,
};

const TYPE_ICONS_SMALL: Record<string, React.ReactNode> = {
  character: <User size={11} />,
  location:  <MapPin size={11} />,
  organization: <Building2 size={11} />,
};

const TYPE_LABELS: Record<string, string> = {
  character: 'Characters',
  location: 'Locations',
  organization: 'Organizations',
};

const UNCATEGORIZED = '__uncategorized__';

const MIN_HEIGHT = 180;
const DEFAULT_HEIGHT = 300;
const MAX_HEIGHT = 600;

export function ContentBrowser({ onOpenFile, onClose }: ContentBrowserProps) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
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
  const hasUncategorized = entries.some(e => !e.type);

  const isSearching = search.trim().length > 0;

  const searchFiltered = entries.filter(entry => {
    const q = search.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      (entry.summary ?? '').toLowerCase().includes(q) ||
      (entry.aliases ?? '').toLowerCase().includes(q) ||
      (entry.tags ?? '').toLowerCase().includes(q)
    );
  });

  const folderEntries = selectedType === UNCATEGORIZED
    ? entries.filter(e => !e.type)
    : entries.filter(e => e.type === selectedType);

  const displayedEntries = isSearching ? searchFiltered : folderEntries;

  const folderLabel = (type: string) =>
    type === UNCATEGORIZED ? 'Uncategorized' : (TYPE_LABELS[type] ?? (type.charAt(0).toUpperCase() + type.slice(1) + 's'));

  const showFolderGrid = !isSearching && selectedType === null;
  const showBreadcrumb = !isSearching && selectedType !== null;

  return (
    <div className="cb-panel" style={{ height }}>
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

        <div className="cb-header-actions">
          <button className="cb-icon-btn" onClick={loadEntries} title="Refresh" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'cb-spin' : ''} />
          </button>
          <button className="cb-icon-btn" onClick={onClose} title="Close (Shift+Space)">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {showBreadcrumb && (
        <div className="cb-breadcrumb">
          <button className="cb-breadcrumb-back" onClick={() => setSelectedType(null)}>
            <ChevronLeft size={13} />
            All types
          </button>
          <span className="cb-breadcrumb-sep">/</span>
          <span className="cb-breadcrumb-current">
            {TYPE_ICONS[selectedType!] ?? <Folder size={13} />}
            {folderLabel(selectedType!)}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="cb-content">
        {loading && (
          <div className="cb-empty">
            <Loader size={16} className="cb-spin" />
            <span>Loading wiki...</span>
          </div>
        )}
        {error && <div className="cb-error">{error}</div>}

        {/* Root folder grid */}
        {!loading && !error && showFolderGrid && (
          <>
            {entries.length === 0 ? (
              <div className="cb-empty">
                No wiki entries found. Create .md files in .wiki/ to get started.
              </div>
            ) : (
              <div className="cb-folder-grid">
                {availableTypes.map(type => (
                  <button
                    key={type}
                    className="cb-folder"
                    onClick={() => setSelectedType(type)}
                  >
                    <span className="cb-folder-icon">
                      {TYPE_ICONS[type] ?? <Folder size={20} />}
                    </span>
                    <span className="cb-folder-label">{folderLabel(type)}</span>
                    <span className="cb-folder-count">{entries.filter(e => e.type === type).length}</span>
                  </button>
                ))}
                {hasUncategorized && (
                  <button
                    className="cb-folder"
                    onClick={() => setSelectedType(UNCATEGORIZED)}
                  >
                    <span className="cb-folder-icon"><Folder size={20} /></span>
                    <span className="cb-folder-label">Uncategorized</span>
                    <span className="cb-folder-count">{entries.filter(e => !e.type).length}</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Entry grid (inside folder or search results) */}
        {!loading && !error && !showFolderGrid && (
          <>
            {displayedEntries.length === 0 ? (
              <div className="cb-empty">
                {isSearching ? 'No entries match your search.' : 'No entries in this folder.'}
              </div>
            ) : (
              <div className="cb-grid">
                {displayedEntries.map(entry => (
                  <button
                    key={entry.path}
                    className="cb-card"
                    onClick={() => onOpenFile(entry.path)}
                    title={entry.path}
                  >
                    <div className="cb-card-header">
                      <span className="cb-card-name">{entry.name}</span>
                      {entry.type && isSearching && (
                        <span className="cb-card-type">
                          {TYPE_ICONS_SMALL[entry.type] ?? <FileText size={11} />}
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
          </>
        )}
      </div>
    </div>
  );
}
