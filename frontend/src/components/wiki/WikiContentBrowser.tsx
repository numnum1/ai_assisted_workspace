import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, FileText, X, FolderOpen } from "lucide-react";
import { wikiApi } from "../../api.ts";
import "./WikiContentBrowser.css";

interface WikiAsset {
  /** Path relative to the wiki root, e.g. "charaktere/anna.md" */
  path: string;
  displayName: string;
  category: string;
  /** Snippet from a search hit (only present while searching). */
  snippet?: string;
}

interface WikiContentBrowserProps {
  onClose: () => void;
  /** Opens a project-relative path in the editor (e.g. "wiki/charaktere/anna.md"). */
  onOpenFile: (path: string) => void;
}

function fileDisplayName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function fileCategory(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[parts.length - 2] : "wiki";
}

/** Deterministic hue per category, so each asset type gets a stable accent color. */
function categoryHue(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) % 360;
  }
  return hash;
}

/** The mention syntax inserted when an asset is dropped into a text field. */
function mentionFor(asset: WikiAsset): string {
  return `@[${asset.displayName}](wiki/${asset.path})`;
}

export function WikiContentBrowser({
  onClose,
  onOpenFile,
}: WikiContentBrowserProps) {
  const [allAssets, setAllAssets] = useState<WikiAsset[]>([]);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<WikiAsset[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the full asset list once on mount (component is remounted on each open).
  useEffect(() => {
    let cancelled = false;
    void wikiApi
      .listFiles()
      .then((paths) => {
        if (cancelled) return;
        setAllAssets(
          paths.map((path) => ({
            path,
            displayName: fileDisplayName(path),
            category: fileCategory(path),
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, []);

  // Full-text search through the wiki backend (debounced) when typing.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      void wikiApi.search(trimmed, 60).then((hits) => {
        if (cancelled) return;
        setSearchHits(
          hits.map((h) => ({
            path: h.path,
            displayName: h.title || fileDisplayName(h.path),
            category: fileCategory(h.path),
            snippet: h.snippet,
          })),
        );
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const categories = useMemo(() => {
    const set = new Set(allAssets.map((a) => a.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allAssets]);

  const visibleAssets = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let base: WikiAsset[];
    if (!trimmed) {
      base = allAssets;
    } else {
      // Prefer backend full-text hits; until they arrive, fall back to a
      // filename match so the grid never flashes empty mid-typing.
      const byName = allAssets.filter((a) =>
        a.displayName.toLowerCase().includes(trimmed),
      );
      base = searchHits && searchHits.length > 0 ? searchHits : byName;
    }
    if (!activeCategory) return base;
    return base.filter((a) => a.category === activeCategory);
  }, [searchHits, allAssets, query, activeCategory]);

  // Clamp the selection at render time rather than resetting it from an effect.
  const safeIdx =
    visibleAssets.length === 0
      ? 0
      : Math.min(selectedIdx, visibleAssets.length - 1);

  const openAsset = useCallback(
    (asset: WikiAsset) => {
      onOpenFile(`wiki/${asset.path}`);
      onClose();
    },
    [onOpenFile, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, visibleAssets.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && visibleAssets[safeIdx]) {
        e.preventDefault();
        openAsset(visibleAssets[safeIdx]);
      }
    },
    [visibleAssets, safeIdx, openAsset, onClose],
  );

  return (
    <div className="wiki-cb-overlay" onClick={onClose}>
      <div
        className="wiki-cb-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="wiki-cb-header">
          <div className="wiki-cb-search-row">
            <Search size={15} className="wiki-cb-search-icon" />
            <input
              ref={inputRef}
              className="wiki-cb-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Wiki durchsuchen…"
            />
          </div>
          <div className="wiki-cb-tabs">
            <button
              className={`wiki-cb-tab${activeCategory === null ? " active" : ""}`}
              onClick={() => setActiveCategory(null)}
            >
              Alle
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`wiki-cb-tab${activeCategory === cat ? " active" : ""}`}
                onClick={() =>
                  setActiveCategory((c) => (c === cat ? null : cat))
                }
                style={{ "--cat-hue": categoryHue(cat) } as React.CSSProperties}
              >
                <span className="wiki-cb-tab-dot" />
                {cat}
              </button>
            ))}
          </div>
          <button
            className="wiki-cb-close"
            onClick={onClose}
            title="Schließen (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="wiki-cb-body">
          {loading ? (
            <div className="wiki-cb-empty">Lade Wiki…</div>
          ) : visibleAssets.length === 0 ? (
            <div className="wiki-cb-empty">
              {query.trim() ? "Keine Treffer" : "Keine Wiki-Einträge gefunden"}
            </div>
          ) : (
            <div className="wiki-cb-grid">
              {visibleAssets.map((asset, i) => (
                <div
                  key={asset.path}
                  className={`wiki-cb-tile${i === safeIdx ? " selected" : ""}`}
                  style={
                    {
                      "--cat-hue": categoryHue(asset.category),
                    } as React.CSSProperties
                  }
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", mentionFor(asset));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onDoubleClick={() => openAsset(asset)}
                  title={`${asset.path}\n\nDoppelklick: öffnen · Ziehen: als Verweis einfügen`}
                >
                  <div className="wiki-cb-thumb">
                    <FileText size={26} strokeWidth={1.5} />
                  </div>
                  <div className="wiki-cb-tile-name">{asset.displayName}</div>
                  {asset.snippet ? (
                    <div className="wiki-cb-tile-snippet">{asset.snippet}</div>
                  ) : (
                    <div className="wiki-cb-tile-cat">
                      <FolderOpen size={11} /> {asset.category}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wiki-cb-footer">
          <span>{visibleAssets.length} Assets</span>
          <span className="wiki-cb-footer-hint">
            Doppelklick öffnet · Ziehen fügt <code>@Verweis</code> ein · Esc
            schließt
          </span>
        </div>
      </div>
    </div>
  );
}
