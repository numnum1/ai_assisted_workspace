import { useState, useEffect } from 'react';
import { X, Clock, User, ExternalLink, Loader, ArrowLeft } from 'lucide-react';
import { gitApi, filesApi } from '../../api.ts';
import type { GitCommit } from '../../types.ts';
import { type DiffLine, computeDiff, collapseDiff } from '../../utils/diffUtils.ts';

interface FileHistoryModalProps {
  filePath: string;
  onClose: () => void;
}

export function FileHistoryModal({ filePath, onClose }: FileHistoryModalProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewingCommit, setViewingCommit] = useState<GitCommit | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const fileName = filePath.split('/').pop() ?? filePath;

  useEffect(() => {
    setLoading(true);
    setError(null);
    gitApi.fileHistory(filePath)
      .then(setCommits)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [filePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingCommit) setViewingCommit(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, viewingCommit]);

  useEffect(() => {
    if (!viewingCommit) return;
    setViewLoading(true);
    setViewError(null);
    setDiffLines(null);
    Promise.all([
      gitApi.fileAtCommit(filePath, viewingCommit.hash),
      filesApi.getContent(filePath).catch(() => ({ content: '' })),
    ])
      .then(([atCommit, current]) => {
        if (!atCommit.exists) {
          setViewError('File did not exist at this commit.');
          return;
        }
        const raw = computeDiff(atCommit.content, current.content ?? '');
        setDiffLines(collapseDiff(raw));
      })
      .catch((err) => setViewError(err instanceof Error ? err.message : 'Failed to load file'))
      .finally(() => setViewLoading(false));
  }, [filePath, viewingCommit]);

  const handleOpenCommit = (commit: GitCommit) => {
    setViewingCommit(commit);
  };

  const shortHash = (hash: string) => hash.substring(0, 8);

  if (viewingCommit) {
    const addedCount = diffLines?.filter((l) => l.type === 'added').length ?? 0;
    const removedCount = diffLines?.filter((l) => l.type === 'removed').length ?? 0;
    const hasChanges = addedCount > 0 || removedCount > 0;

    return (
      <div className="file-history-overlay" onClick={onClose}>
        <div className="file-history-modal" onClick={(e) => e.stopPropagation()}>
          <div className="file-history-header">
            <button className="file-history-back-btn" onClick={() => setViewingCommit(null)} title="Back to history">
              <ArrowLeft size={16} />
            </button>
            <div className="file-history-viewer-title">
              <span className="file-history-title">{fileName}</span>
              <span className="file-history-viewer-commit">{shortHash(viewingCommit.hash)} — {viewingCommit.message} → aktuell</span>
            </div>
            {diffLines && (
              <span className="change-card-stats">
                {addedCount > 0 && <span className="change-card-added">+{addedCount}</span>}
                {removedCount > 0 && <span className="change-card-removed">−{removedCount}</span>}
              </span>
            )}
            <button className="file-history-close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>

          {viewLoading && (
            <div className="file-history-loading">
              <Loader size={18} className="file-history-spinner" />
              <span>Loading diff...</span>
            </div>
          )}

          {viewError && <div className="file-history-error">{viewError}</div>}

          {!viewLoading && !viewError && diffLines && !hasChanges && (
            <div className="file-history-empty">No changes since this commit.</div>
          )}

          {!viewLoading && !viewError && diffLines && hasChanges && (
            <div className="file-history-diff">
              {diffLines.map((line, idx) => (
                <div key={idx} className={`diff-line diff-line--${line.type}`}>
                  <span className="diff-line-marker">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                  </span>
                  <span className="diff-line-content">
                    {line.content === '…' ? (
                      <em className="diff-ellipsis">…</em>
                    ) : (
                      line.content || ' '
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="file-history-overlay" onClick={onClose}>
      <div className="file-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-history-header">
          <span className="file-history-title">
            History — <span className="file-history-filename">{fileName}</span>
          </span>
          <button className="file-history-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="file-history-loading">
            <Loader size={18} className="file-history-spinner" />
            <span>Loading history...</span>
          </div>
        )}

        {error && <div className="file-history-error">{error}</div>}

        {!loading && !error && commits.length === 0 && (
          <div className="file-history-empty">No commits found for this file.</div>
        )}

        {!loading && commits.length > 0 && (
          <div className="file-history-list">
            {commits.map((commit) => (
              <div key={commit.hash} className="file-history-row">
                <div className="file-history-row-meta">
                  <span className="file-history-hash">{shortHash(commit.hash)}</span>
                  <span className="file-history-date">
                    <Clock size={11} />
                    {commit.date}
                  </span>
                  <span className="file-history-author">
                    <User size={11} />
                    {commit.author}
                  </span>
                </div>
                <div className="file-history-row-bottom">
                  <span className="file-history-message">{commit.message}</span>
                  <button
                    className="file-history-open-btn"
                    onClick={() => handleOpenCommit(commit)}
                    title="Open file at this commit in a new window"
                  >
                    <ExternalLink size={12} />
                    Open
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
