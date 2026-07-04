import { useState, useEffect } from 'react';
import { X, Clock, User, ExternalLink, Loader, ArrowLeft } from 'lucide-react';
import { gitApi } from '../../api.ts';
import type { GitCommit } from '../../types.ts';

interface FileHistoryModalProps {
  filePath: string;
  onClose: () => void;
}

export function FileHistoryModal({ filePath, onClose }: FileHistoryModalProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewingCommit, setViewingCommit] = useState<GitCommit | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
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
    setViewContent(null);
    gitApi.fileAtCommit(filePath, viewingCommit.hash)
      .then((result) => {
        if (!result.exists) setViewError('File did not exist at this commit.');
        else setViewContent(result.content);
      })
      .catch((err) => setViewError(err instanceof Error ? err.message : 'Failed to load file'))
      .finally(() => setViewLoading(false));
  }, [filePath, viewingCommit]);

  const handleOpenCommit = (commit: GitCommit) => {
    setViewingCommit(commit);
  };

  const shortHash = (hash: string) => hash.substring(0, 8);

  if (viewingCommit) {
    return (
      <div className="file-history-overlay" onClick={onClose}>
        <div className="file-history-modal" onClick={(e) => e.stopPropagation()}>
          <div className="file-history-header">
            <button className="file-history-back-btn" onClick={() => setViewingCommit(null)} title="Back to history">
              <ArrowLeft size={16} />
            </button>
            <div className="file-history-viewer-title">
              <span className="file-history-title">{fileName}</span>
              <span className="file-history-viewer-commit">{shortHash(viewingCommit.hash)} — {viewingCommit.message}</span>
            </div>
            <button className="file-history-close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>

          {viewLoading && (
            <div className="file-history-loading">
              <Loader size={18} className="file-history-spinner" />
              <span>Loading file...</span>
            </div>
          )}

          {viewError && <div className="file-history-error">{viewError}</div>}

          {!viewLoading && !viewError && viewContent !== null && (
            <pre className="file-history-viewer">{viewContent}</pre>
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
