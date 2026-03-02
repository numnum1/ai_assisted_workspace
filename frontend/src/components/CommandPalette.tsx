import { useState, useEffect, useRef, useMemo } from 'react';
import { FolderOpen, Search, ArrowLeft } from 'lucide-react';

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  handler: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  onOpenFolder: (path: string) => Promise<void>;
}

type PaletteView = 'search' | 'open-folder';

export function CommandPalette({ open, onClose, actions, onOpenFolder }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<PaletteView>('search');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setView('search');
      setFolderPath('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return actions;
    const lower = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(lower));
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (view !== 'search') {
        setView('search');
        setError(null);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        onClose();
      }
      return;
    }

    if (view === 'open-folder') {
      if (e.key === 'Enter' && folderPath.trim()) {
        handleOpenFolder();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      const action = filtered[selectedIndex];
      if (action.id === 'open-folder') {
        setView('open-folder');
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        action.handler();
        onClose();
      }
    }
  };

  const handleOpenFolder = async () => {
    setError(null);
    setLoading(true);
    try {
      await onOpenFolder(folderPath.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {view === 'search' ? (
          <>
            <div className="command-palette-input-row">
              <Search size={16} className="command-palette-search-icon" />
              <input
                ref={inputRef}
                className="command-palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                autoFocus
              />
            </div>
            <div className="command-palette-results">
              {filtered.length === 0 && (
                <div className="command-palette-empty">No matching commands</div>
              )}
              {filtered.map((action, i) => (
                <div
                  key={action.id}
                  className={`command-palette-item ${i === selectedIndex ? 'selected' : ''}`}
                  onClick={() => {
                    if (action.id === 'open-folder') {
                      setView('open-folder');
                      setTimeout(() => inputRef.current?.focus(), 50);
                    } else {
                      action.handler();
                      onClose();
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="command-palette-item-icon">{action.icon}</span>
                  <span className="command-palette-item-label">{action.label}</span>
                  {action.shortcut && (
                    <span className="command-palette-item-shortcut">{action.shortcut}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="command-palette-input-row">
              <button
                className="command-palette-back-btn"
                onClick={() => { setView('search'); setError(null); }}
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>
              <FolderOpen size={16} className="command-palette-search-icon" />
              <input
                ref={inputRef}
                className="command-palette-input"
                value={folderPath}
                onChange={(e) => { setFolderPath(e.target.value); setError(null); }}
                placeholder="Enter folder path, e.g. C:\Users\marcm\Books\my-novel"
                autoFocus
                disabled={loading}
              />
            </div>
            {error && <div className="command-palette-error">{error}</div>}
            <div className="command-palette-hint">
              Press Enter to open the folder. Escape to go back.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
