import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, ArrowDown, ArrowUp, Check, GitCommitHorizontal, Loader } from 'lucide-react';
import type { ContextInfo, GitSyncStatus } from '../types.ts';
import { gitApi } from '../api.ts';

interface ContextBarProps {
  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
}

export function ContextBar({ contextInfo, activeFile, isDirty }: ContextBarProps) {
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const commitInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await gitApi.aheadBehind();
      setSyncStatus(status);
    } catch {
      // silently ignore if no repo or network error
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (commitOpen) {
      setCommitMessage('');
      setCommitError(null);
      setTimeout(() => commitInputRef.current?.focus(), 50);
    }
  }, [commitOpen]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await gitApi.sync();
      await fetchSyncStatus();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await gitApi.commit(commitMessage.trim());
      setCommitOpen(false);
      await fetchSyncStatus();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const handleCommitKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommitOpen(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleCommit();
    }
  };

  const renderSyncIcon = () => {
    if (syncing) return <Loader size={12} className="context-bar-git-spinner" />;
    if (syncStatus === null) return null;
    if (syncStatus.behind > 0) return <ArrowDown size={12} className="context-bar-git-arrow behind" />;
    if (syncStatus.ahead > 0) return <ArrowUp size={12} className="context-bar-git-arrow ahead" />;
    return <Check size={12} className="context-bar-git-check" />;
  };

  const renderSyncCount = () => {
    if (syncing || syncStatus === null) return null;
    if (syncStatus.behind > 0) return <span className="context-bar-git-count behind">{syncStatus.behind}</span>;
    if (syncStatus.ahead > 0) return <span className="context-bar-git-count ahead">{syncStatus.ahead}</span>;
    return null;
  };

  return (
    <>
      <div className="context-bar">
        <div className="context-bar-left">
          {activeFile && (
            <span className="context-bar-file">
              <FileText size={12} />
              {activeFile}
              {isDirty && ' *'}
            </span>
          )}
        </div>
        <div className="context-bar-right">
          {contextInfo && (
            <>
              <span className="context-bar-files">
                {contextInfo.includedFiles.length} files in context
              </span>
              <span className="context-bar-tokens">
                ~{contextInfo.estimatedTokens.toLocaleString()} tokens
              </span>
            </>
          )}

          <div className="context-bar-git">
            <button
              className="context-bar-git-btn context-bar-sync-btn"
              onClick={handleSync}
              disabled={syncing}
              title={
                syncing ? 'Syncing...' :
                syncError ? syncError :
                syncStatus?.behind ? `Pull ${syncStatus.behind} commit(s)` :
                syncStatus?.ahead ? `Push ${syncStatus.ahead} commit(s)` :
                'Sync with GitHub'
              }
            >
              {renderSyncIcon()}
              <span>Sync</span>
              {renderSyncCount()}
            </button>

            <button
              className="context-bar-git-btn context-bar-commit-btn"
              onClick={() => setCommitOpen(true)}
              title="Commit changes"
            >
              <GitCommitHorizontal size={12} />
              <span>Commit</span>
            </button>
          </div>
        </div>
      </div>

      {commitOpen && (
        <div className="commit-modal-overlay" onClick={() => setCommitOpen(false)}>
          <div className="commit-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleCommitKeyDown}>
            <div className="commit-modal-header">
              <GitCommitHorizontal size={14} />
              <span>Commit changes</span>
            </div>
            <textarea
              ref={commitInputRef}
              className="commit-modal-input"
              value={commitMessage}
              onChange={(e) => { setCommitMessage(e.target.value); setCommitError(null); }}
              placeholder="Commit message..."
              rows={3}
              disabled={committing}
            />
            {commitError && <div className="commit-modal-error">{commitError}</div>}
            <div className="commit-modal-hint">Ctrl+Enter to commit · Escape to cancel</div>
            <div className="commit-modal-actions">
              <button
                className="commit-modal-cancel"
                onClick={() => setCommitOpen(false)}
                disabled={committing}
              >
                Cancel
              </button>
              <button
                className="commit-modal-submit"
                onClick={handleCommit}
                disabled={!commitMessage.trim() || committing}
              >
                {committing ? <Loader size={12} className="context-bar-git-spinner" /> : null}
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
