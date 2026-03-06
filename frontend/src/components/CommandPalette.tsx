import { useState, useEffect, useRef, useMemo } from 'react';
import { FolderOpen, Search, ArrowLeft, Loader, GitCommitHorizontal } from 'lucide-react';
import { projectApi, gitApi } from '../api.ts';

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  handler: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  onOpenFolder: (path: string) => Promise<void>;
  onGitRefresh?: () => void;
}

type PaletteView = 'search' | 'open-folder-manual' | 'commit';

export function CommandPalette({ open, onClose, actions, onOpenFolder, onGitRefresh }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<PaletteView>('search');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setView('search');
      setFolderPath('');
      setError(null);
      setLoading(false);
      setCommitMessage('');
      setCommitError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (view === 'commit') {
      setCommitMessage('');
      setCommitError(null);
      setTimeout(() => commitRef.current?.focus(), 50);
    }
  }, [view]);

  const filtered = useMemo(() => {
    if (!query) return actions;
    const lower = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(lower));
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  const handleBrowseAndOpen = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await projectApi.browse();
      if (result.cancelled || !result.path) {
        setLoading(false);
        return;
      }
      await onOpenFolder(result.path);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder');
      setView('open-folder-manual');
      setLoading(false);
    }
  };

  const handleManualOpen = async () => {
    if (!folderPath.trim()) return;
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

  const handleSync = async () => {
    setError(null);
    setLoading(true);
    try {
      await gitApi.sync();
      onGitRefresh?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setLoading(false);
    }
  };

  const handleCommitSubmit = async () => {
    if (!commitMessage.trim() || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await gitApi.commit(commitMessage.trim());
      onGitRefresh?.();
      onClose();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const activateAction = (action: CommandAction) => {
    if (action.id === 'open-folder') {
      handleBrowseAndOpen();
    } else if (action.id === 'git-sync') {
      handleSync();
    } else if (action.id === 'git-commit') {
      setView('commit');
    } else {
      action.handler();
      onClose();
    }
  };

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

    if (view === 'open-folder-manual') {
      if (e.key === 'Enter' && folderPath.trim()) {
        handleManualOpen();
      }
      return;
    }

    if (view === 'commit') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleCommitSubmit();
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
      activateAction(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={loading || committing ? undefined : onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>

        {/* Sync loading */}
        {loading && view === 'search' && (
          <div className="command-palette-loading">
            <Loader size={18} className="command-palette-spinner" />
            <span>Syncing with GitHub...</span>
          </div>
        )}

        {/* Main search view */}
        {!loading && view === 'search' && (
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
            {error && <div className="command-palette-error">{error}</div>}
            <div className="command-palette-results">
              {filtered.length === 0 && (
                <div className="command-palette-empty">No matching commands</div>
              )}
              {filtered.map((action, i) => (
                <div
                  key={action.id}
                  className={`command-palette-item ${i === selectedIndex ? 'selected' : ''}`}
                  onClick={() => activateAction(action)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="command-palette-item-icon">{action.icon}</span>
                  <span className="command-palette-item-label">{action.label}</span>
                  {action.badge && (
                    <span className="command-palette-item-badge">{action.badge}</span>
                  )}
                  {action.shortcut && (
                    <span className="command-palette-item-shortcut">{action.shortcut}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Open folder manual view */}
        {view === 'open-folder-manual' && (
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

        {/* Commit view */}
        {view === 'commit' && (
          <>
            <div className="command-palette-input-row">
              <button
                className="command-palette-back-btn"
                onClick={() => { setView('search'); setCommitError(null); }}
                title="Back"
                disabled={committing}
              >
                <ArrowLeft size={16} />
              </button>
              <GitCommitHorizontal size={16} className="command-palette-search-icon" />
              <span className="command-palette-view-title">Commit changes</span>
            </div>
            <textarea
              ref={commitRef}
              className="command-palette-commit-input"
              value={commitMessage}
              onChange={(e) => { setCommitMessage(e.target.value); setCommitError(null); }}
              placeholder="Commit message..."
              rows={3}
              disabled={committing}
            />
            {commitError && <div className="command-palette-error">{commitError}</div>}
            <div className="command-palette-hint">
              Ctrl+Enter to commit · Escape to go back
            </div>
            <div className="command-palette-commit-actions">
              <button
                className="command-palette-commit-submit"
                onClick={handleCommitSubmit}
                disabled={!commitMessage.trim() || committing}
              >
                {committing
                  ? <Loader size={12} className="command-palette-spinner" />
                  : <GitCommitHorizontal size={12} />
                }
                Commit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
