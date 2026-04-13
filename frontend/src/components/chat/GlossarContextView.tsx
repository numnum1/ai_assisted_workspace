import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type GlossaryEntryDto = { term: string; definition: string };

type GlossaryApiResponse = {
  content: string;
  exists: boolean;
  prefixMarkdown?: string;
  entries?: GlossaryEntryDto[];
};

interface GlossarContextViewProps {
  /** When false, no fetch runs (parent can keep instance mounted). */
  expanded: boolean;
}

type GlossarData = {
  content: string;
  exists: boolean;
  prefixMarkdown: string;
  entries: GlossaryEntryDto[];
};

function normalizeGlossaryPayload(json: GlossaryApiResponse): GlossarData {
  const entries = Array.isArray(json.entries)
    ? json.entries
        .filter((e) => e && typeof e.term === 'string')
        .map((e) => ({
          term: e.term,
          definition: typeof e.definition === 'string' ? e.definition : '',
        }))
    : [];
  return {
    content: typeof json.content === 'string' ? json.content : '',
    exists: Boolean(json.exists),
    prefixMarkdown: typeof json.prefixMarkdown === 'string' ? json.prefixMarkdown : '',
    entries,
  };
}

export function GlossarContextView({ expanded }: GlossarContextViewProps) {
  const [data, setData] = useState<GlossarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingTerm, setDeletingTerm] = useState<string | null>(null);
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
      setData(normalizeGlossaryPayload(json));
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

  const handleDeleteEntry = useCallback(
    async (term: string) => {
      setError(null);
      setDeletingTerm(term);
      try {
        const res = await fetch(`/api/glossary/entries?term=${encodeURIComponent(term)}`, {
          method: 'DELETE',
        });
        if (res.status === 404) {
          setError('Eintrag oder Glossar nicht gefunden.');
          await load();
          return;
        }
        if (!res.ok) {
          setError(`Löschen fehlgeschlagen (${res.status})`);
          return;
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Netzwerkfehler');
      } finally {
        setDeletingTerm(null);
      }
    },
    [load],
  );

  const hasStructuredBody =
    data !== null &&
    data.exists &&
    (data.prefixMarkdown.trim() !== '' || data.entries.length > 0);

  const isTrulyEmpty =
    data !== null && data.exists && data.content.trim() === '' && !hasStructuredBody;

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
      {isTrulyEmpty && (
        <p className="glossar-context-view-empty">Das Glossar ist noch leer.</p>
      )}
      {data !== null && data.exists && hasStructuredBody && (
        <div className="glossar-context-view-body">
          {data.prefixMarkdown.trim() !== '' && (
            <div className="glossar-context-view-prefix">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.prefixMarkdown}</ReactMarkdown>
            </div>
          )}
          {data.entries.length > 0 && (
            <ul className="glossar-context-view-entry-list">
              {data.entries.map((entry, index) => (
                <li key={`${index}-${entry.term}`} className="glossar-context-view-entry">
                  <div className="glossar-context-view-entry-text">
                    <strong className="glossar-context-view-entry-term">{entry.term}</strong>
                    <span className="glossar-context-view-entry-sep">: </span>
                    <span className="glossar-context-view-entry-def">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.definition}</ReactMarkdown>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="glossar-context-view-entry-remove"
                    title="Eintrag entfernen"
                    aria-label={`Glossar-Eintrag „${entry.term}“ entfernen`}
                    disabled={deletingTerm !== null}
                    onClick={() => void handleDeleteEntry(entry.term)}
                  >
                    {deletingTerm === entry.term ? '…' : '×'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {data !== null &&
        data.exists &&
        !hasStructuredBody &&
        data.content.trim() !== '' &&
        !isTrulyEmpty && (
          <div className="glossar-context-view-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
          </div>
        )}
    </div>
  );
}
