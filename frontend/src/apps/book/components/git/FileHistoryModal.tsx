import { useState, useEffect } from 'react';
import { X, Clock, User, ExternalLink, Loader } from 'lucide-react';
import { gitApi } from '../../../../shared/api.ts';
import type { GitCommit } from '../../../../shared/types.ts';

interface FileHistoryModalProps {
  filePath: string;
  onClose: () => void;
  /** Called once the content at a commit has been fetched; the caller shows the diff inline in the editor. */
  onOpenDiff: (filePath: string, originalContent: string, label: string) => void;
}

export function FileHistoryModal({ filePath, onClose, onOpenDiff }: FileHistoryModalProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingHash, setOpeningHash] = useState<string | null>(null);

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

  const shortHash = (hash: string) => hash.substring(0, 8);

  const handleOpenCommit = async (commit: GitCommit) => {
    setOpeningHash(commit.hash);
    setError(null);
    try {
      const result = await gitApi.fileAtCommit(filePath, commit.hash);
      if (!result.exists) {
        setError('File did not exist at this commit.');
        return;
      }
      onOpenDiff(filePath, result.content, shortHash(commit.hash));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file at this commit');
    } finally {
      setOpeningHash(null);
    }
  };

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
                    disabled={openingHash !== null}
                    title="Show diff against this commit in the editor"
                  >
                    {openingHash === commit.hash ? (
                      <Loader size={12} className="file-history-spinner" />
                    ) : (
                      <ExternalLink size={12} />
                    )}
                    Diff
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
