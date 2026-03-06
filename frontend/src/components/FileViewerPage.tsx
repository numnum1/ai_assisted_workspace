import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { gitApi } from '../api.ts';

export function FileViewerPage() {
  const params = new URLSearchParams(window.location.search);
  const filePath = params.get('path') ?? '';
  const hash = params.get('hash') ?? '';

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = filePath.split('/').pop() ?? filePath;
  const shortHash = hash.substring(0, 8);

  useEffect(() => {
    if (!filePath || !hash) {
      setError('Missing path or hash parameter.');
      setLoading(false);
      return;
    }
    gitApi.fileAtCommit(filePath, hash)
      .then((result) => {
        if (!result.exists) {
          setError('File did not exist at this commit.');
        } else {
          setContent(result.content);
          document.title = `${fileName} @ ${shortHash}`;
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load file'))
      .finally(() => setLoading(false));
  }, [filePath, hash, fileName, shortHash]);

  return (
    <div className="file-viewer-page">
      <div className="file-viewer-header">
        <span className="file-viewer-name">{fileName}</span>
        <span className="file-viewer-meta">{shortHash}{content !== null ? ` · read-only` : ''}</span>
      </div>

      {loading && (
        <div className="file-viewer-loading">
          <Loader size={20} className="file-history-spinner" />
          <span>Loading...</span>
        </div>
      )}

      {error && <div className="file-viewer-error">{error}</div>}

      {!loading && content !== null && (
        <pre className="file-viewer-content">{content}</pre>
      )}
    </div>
  );
}
