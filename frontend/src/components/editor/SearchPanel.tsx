import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, FileText } from "lucide-react";
import { searchApi } from "../../api.ts";

interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

interface SearchPanelProps {
  onOpenFile?: (path: string, line?: number) => void;
  onClose?: () => void;
}

function groupHits(hits: SearchHit[]): Map<string, SearchHit[]> {
  const map = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    if (!map.has(hit.path)) map.set(hit.path, []);
    map.get(hit.path)!.push(hit);
  }
  return map;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchPanel({ onOpenFile, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setHits([]);
      setSearched(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const data = await searchApi.query(q, 200);
      setHits(data.hits ?? []);
      setSearched(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setHits([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void doSearch(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, doSearch]);

  const grouped = groupHits(hits);
  const fileCount = grouped.size;
  const hitCount = hits.length;

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <span className="search-panel-title">Projektweite Suche</span>
        <button
          className="search-panel-close"
          onClick={onClose}
          title="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      <div className="search-panel-input-row">
        <Search size={14} className="search-panel-icon" />
        <input
          ref={inputRef}
          className="search-panel-input"
          placeholder="Suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose?.();
          }}
        />
        {query && (
          <button className="search-panel-clear" onClick={() => setQuery("")}>
            <X size={12} />
          </button>
        )}
      </div>

      {searched && !loading && (
        <div className="search-panel-stats">
          {hitCount === 0
            ? "Keine Treffer"
            : `${hitCount} Treffer in ${fileCount} ${fileCount === 1 ? "Datei" : "Dateien"}`}
        </div>
      )}

      <div className="search-panel-results">
        {loading && <div className="search-panel-loading">Suche…</div>}
        {!loading &&
          Array.from(grouped.entries()).map(([path, fileHits]) => (
            <div key={path} className="search-result-group">
              <div
                className="search-result-file"
                onClick={() => onOpenFile?.(path)}
                title={path}
              >
                <FileText size={13} />
                <span className="search-result-file-name">
                  {path.split("/").pop()}
                </span>
                <span className="search-result-file-path">{path}</span>
                <span className="search-result-count">{fileHits.length}</span>
              </div>
              {fileHits.map((hit, idx) => (
                <div
                  key={idx}
                  className="search-result-hit"
                  onClick={() => onOpenFile?.(hit.path, hit.line)}
                >
                  <span className="search-result-line">{hit.line}</span>
                  <span className="search-result-preview">
                    {highlightMatch(hit.preview, query)}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
