import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type GlossaryApiResponse = { content: string; exists: boolean };

interface GlossarContextViewProps {
  /** When false, no fetch runs (parent can keep instance mounted). */
  expanded: boolean;
}

export function GlossarContextView({ expanded }: GlossarContextViewProps) {
  const [data, setData] = useState<{ content: string; exists: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didLoadOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/glossary');
      if (!res.ok) {
        setError(`Anfrage fehlgeschlagen (${res.status})`);
        return;
      }
      const json = (await res.json()) as GlossaryApiResponse;
      setData({
        content: typeof json.content === 'string' ? json.content : '',
        exists: Boolean(json.exists),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    if (didLoadOnce.current) return;
    didLoadOnce.current = true;
    void load();
  }, [expanded, load]);

  const handleRefresh = useCallback(() => {
    void load();
  }, [load]);

  return (
    <div className="glossar-context-view">
      <div className="glossar-context-view-toolbar">
        <button
          type="button"
          className="glossar-context-view-refresh"
          onClick={handleRefresh}
          disabled={loading}
          title="Glossar aktualisieren"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>
      {error && (
        <div className="glossar-context-view-error" role="alert">
          {error}
        </div>
      )}
      {loading && data === null && !error && (
        <div className="glossar-context-view-loading">Lade Glossar…</div>
      )}
      {data !== null && !data.exists && (
        <p className="glossar-context-view-empty">Kein Glossar (.assistant/glossary.md) vorhanden.</p>
      )}
      {data !== null && data.exists && (!data.content || !data.content.trim()) && (
        <p className="glossar-context-view-empty">Das Glossar ist noch leer.</p>
      )}
      {data !== null && data.exists && data.content.trim() !== '' && (
        <div className="glossar-context-view-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
