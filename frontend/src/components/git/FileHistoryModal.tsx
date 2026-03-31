import { useState, useEffect } from 'react';
import { X, Clock, User, ExternalLink, Loader } from 'lucide-react';
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOpenCommit = (commit: GitCommit) => {
    const params = new URLSearchParams({
      viewer: '1',
      path: filePath,
      hash: commit.hash,
    });
    window.open(`${window.location.pathname}?${params.toString()}`, '_blank');
  };

  const shortHash = (hash: string) => hash.substring(0, 8);

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
