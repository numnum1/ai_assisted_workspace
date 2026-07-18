import { useState, useEffect } from 'react';
import { X, Clock, User, ExternalLink, Loader } from 'lucide-react';
import { gitApi, chapterApi } from '../../../../shared/api.ts';
import type { GitCommit, ChapterNode, ChapterFilePaths } from '../../../../shared/types.ts';

interface ChapterHistoryModalProps {
  chapter: ChapterNode;
  structureRoot: string | null;
  onClose: () => void;
  /** Called once the content of every scene/action at a commit has been fetched (keyed by `sceneId/actionId`); the caller shows the diff inline per scene block. */
  onOpenDiff: (contentByAction: Map<string, string>, label: string) => void;
}

function actionKey(sceneId: string, actionId: string): string {
  return `${sceneId}/${actionId}`;
}

export function ChapterHistoryModal({ chapter, structureRoot, onClose, onOpenDiff }: ChapterHistoryModalProps) {
  const [filePaths, setFilePaths] = useState<ChapterFilePaths | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingHash, setOpeningHash] = useState<string | null>(null);

  const chapterTitle = chapter.meta.title || chapter.id;

  useEffect(() => {
    setLoading(true);
    setError(null);
    chapterApi.getFilePaths(chapter.id, structureRoot)
      .then((paths) => {
        setFilePaths(paths);
        return gitApi.fileHistory(paths.chapterDirRelPath);
      })
      .then(setCommits)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [chapter.id, structureRoot]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const shortHash = (hash: string) => hash.substring(0, 8);

  const handleOpenCommit = async (commit: GitCommit) => {
    if (!filePaths) return;
    setOpeningHash(commit.hash);
    setError(null);
    try {
      const results = await Promise.all(
        filePaths.actions.map((a) => gitApi.fileAtCommit(a.relPath, commit.hash)),
      );
      const contentByAction = new Map<string, string>();
      filePaths.actions.forEach((a, idx) => {
        const result = results[idx];
        if (result.exists) contentByAction.set(actionKey(a.sceneId, a.actionId), result.content);
      });
      onOpenDiff(contentByAction, shortHash(commit.hash));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chapter content at this commit');
    } finally {
      setOpeningHash(null);
    }
  };

  return (
    <div className="file-history-overlay" onClick={onClose}>
      <div className="file-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-history-header">
          <span className="file-history-title">
            Verlauf — <span className="file-history-filename">{chapterTitle}</span>
          </span>
          <button className="file-history-close-btn" onClick={onClose} title="Schließen">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="file-history-loading">
            <Loader size={18} className="file-history-spinner" />
            <span>Lade Verlauf…</span>
          </div>
        )}

        {error && <div className="file-history-error">{error}</div>}

        {!loading && !error && commits.length === 0 && (
          <div className="file-history-empty">Keine Commits für dieses Kapitel gefunden.</div>
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
                    title="Diff zu diesem Commit in den Szenen anzeigen"
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
