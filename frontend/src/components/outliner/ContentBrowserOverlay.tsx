import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Folder, FileText, X, ChevronRight, ArrowUp, FolderOpen } from "lucide-react";
import { filesApi, wikiApi } from "../../api.ts";
import type { FileNode } from "../../types.ts";
import "./ContentBrowserOverlay.css";

type Tab = "wiki" | "buch" | "beide";

interface WikiAsset {
  /** Path relative to the wiki root, e.g. "charaktere/anna.md" */
  path: string;
  displayName: string;
  category: string;
  snippet?: string;
}

interface Tile {
  key: string;
  name: string;
  directory: boolean;
  category?: string;
  snippet?: string;
  /** Project-relative path to open, or the folder path to navigate into. */
  path: string;
}

interface ContentBrowserOverlayProps {
  open: boolean;
  projectPath: string | null;
  onClose: () => void;
  /** Opens a project-relative path in the editor. */
  onSelectFile: (path: string) => void;
}

function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
  if (root.path === targetPath) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const found = findNodeByPath(child, targetPath);
    if (found) return found;
  }
  return null;
}

function parentPath(path: string): string {
  if (path === "." || !path.includes("/")) return ".";
  return path.slice(0, path.lastIndexOf("/"));
}

function breadcrumbSegments(path: string): { label: string; path: string }[] {
  if (path === ".") return [];
  const parts = path.split("/");
  const segments: { label: string; path: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    segments.push({ label: part, path: acc });
  }
  return segments;
}

function fileDisplayName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function fileCategory(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[parts.length - 2] : "wiki";
}

/** Deterministic hue per category, so each wiki asset type gets a stable accent color. */
function categoryHue(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) % 360;
  }
  return hash;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "wiki", label: "Wiki" },
  { id: "buch", label: "Buch" },
  { id: "beide", label: "Beide" },
];

export function ContentBrowserOverlay({
  open,
  projectPath,
  onClose,
  onSelectFile,
}: ContentBrowserOverlayProps) {
  const [activeTab, setActiveTab] = useState<Tab>("wiki");
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Tree data (Buch / Beide tabs) ---
  const [root, setRoot] = useState<FileNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(".");

  // --- Wiki data (Wiki tab) ---
  const [allWikiAssets, setAllWikiAssets] = useState<WikiAsset[]>([]);
  const [wikiSearchHits, setWikiSearchHits] = useState<WikiAsset[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(true);

  // Reset navigation state and (re)load data each time the popup opens.
  useEffect(() => {
    if (!open || !projectPath) return;
    let cancelled = false;
    setQuery("");
    setSelectedIdx(0);
    setCurrentPath(".");
    setActiveCategory(null);
    setWikiSearchHits(null);

    setTreeLoading(true);
    setTreeError(null);
    filesApi
      .getTree()
      .then((tree) => {
        if (!cancelled) setRoot(tree);
      })
      .catch((e) => {
        if (!cancelled)
          setTreeError(e instanceof Error ? e.message : "Baum konnte nicht geladen werden");
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });

    setWikiLoading(true);
    wikiApi
      .listFiles()
      .then((paths) => {
        if (cancelled) return;
        setAllWikiAssets(
          paths.map((path) => ({
            path,
            displayName: fileDisplayName(path),
            category: fileCategory(path),
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setWikiLoading(false);
      });

    const focusTimer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [open, projectPath]);

  // Full-text wiki search (debounced) — only relevant while the Wiki tab is active.
  useEffect(() => {
    if (activeTab !== "wiki") return;
    const trimmed = query.trim();
    if (!trimmed) {
      setWikiSearchHits(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void wikiApi.search(trimmed, 60).then((hits) => {
        if (cancelled) return;
        setWikiSearchHits(
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
  }, [activeTab, query]);

  const wikiCategories = useMemo(() => {
    const set = new Set(allWikiAssets.map((a) => a.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allWikiAssets]);

  const currentNode = useMemo(() => {
    if (!root) return null;
    return findNodeByPath(root, currentPath);
  }, [root, currentPath]);

  // Unified tile list for the active tab.
  const tiles = useMemo<Tile[]>(() => {
    if (activeTab === "wiki") {
      const trimmed = query.trim().toLowerCase();
      let base: WikiAsset[];
      if (!trimmed) {
        base = allWikiAssets;
      } else {
        const byName = allWikiAssets.filter((a) =>
          a.displayName.toLowerCase().includes(trimmed),
        );
        base = wikiSearchHits && wikiSearchHits.length > 0 ? wikiSearchHits : byName;
      }
      const filtered = activeCategory ? base.filter((a) => a.category === activeCategory) : base;
      return filtered.map((a) => ({
        key: a.path,
        name: a.displayName,
        directory: false,
        category: a.category,
        snippet: a.snippet,
        path: `wiki/${a.path}`,
      }));
    }

    const children = currentNode?.children ?? [];
    const visible =
      activeTab === "buch"
        ? children.filter((n) => !(n.directory && n.name.toLowerCase() === "wiki"))
        : children;
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? visible.filter((n) => n.name.toLowerCase().includes(trimmed))
      : visible;
    const sorted = [...filtered].sort((a, b) => {
      if (a.directory !== b.directory) return a.directory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map((n) => ({
      key: n.path,
      name: n.name,
      directory: n.directory,
      path: n.path,
    }));
  }, [activeTab, query, allWikiAssets, wikiSearchHits, activeCategory, currentNode]);

  const safeIdx = tiles.length === 0 ? 0 : Math.min(selectedIdx, tiles.length - 1);

  const openTile = useCallback(
    (tile: Tile) => {
      if (tile.directory) {
        setCurrentPath(tile.path);
        setQuery("");
        setSelectedIdx(0);
        inputRef.current?.focus();
      } else {
        onSelectFile(tile.path);
      }
    },
    [onSelectFile],
  );

  const goUp = useCallback(() => {
    if (activeTab === "wiki" || currentPath === ".") return;
    setCurrentPath(parentPath(currentPath));
    setQuery("");
    setSelectedIdx(0);
  }, [activeTab, currentPath]);

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setQuery("");
    setSelectedIdx(0);
    setActiveCategory(null);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key === "1") {
          e.preventDefault();
          switchTab("wiki");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          switchTab("buch");
          return;
        }
        if (e.key === "3") {
          e.preventDefault();
          switchTab("beide");
          return;
        }
      }
      if (e.key === "Backspace" && !query) {
        e.preventDefault();
        goUp();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, tiles.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && tiles[safeIdx]) {
        e.preventDefault();
        openTile(tiles[safeIdx]);
      }
    },
    [tiles, safeIdx, openTile, goUp, query, onClose, switchTab],
  );

  if (!open) return null;

  const isTreeTab = activeTab === "buch" || activeTab === "beide";
  const loading = activeTab === "wiki" ? wikiLoading : treeLoading;
  const crumbs = breadcrumbSegments(currentPath);

  return (
    <div className="content-browser-overlay" onClick={onClose}>
      <div
        className="content-browser-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="content-browser-tabs-row">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`content-browser-tab${activeTab === t.id ? " active" : ""}`}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
              <span className="content-browser-tab-index">{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="content-browser-header">
          <div className="content-browser-search-row">
            <Search size={15} className="content-browser-search-icon" />
            <input
              ref={inputRef}
              className="content-browser-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              }}
              placeholder="Suchen…"
            />
          </div>

          {activeTab === "wiki" ? (
            <div className="content-browser-wiki-tabs">
              <button
                className={`content-browser-cat-tab${activeCategory === null ? " active" : ""}`}
                onClick={() => setActiveCategory(null)}
              >
                Alle
              </button>
              {wikiCategories.map((cat) => (
                <button
                  key={cat}
                  className={`content-browser-cat-tab${activeCategory === cat ? " active" : ""}`}
                  onClick={() => setActiveCategory((c) => (c === cat ? null : cat))}
                  style={{ "--cat-hue": categoryHue(cat) } as React.CSSProperties}
                >
                  <span className="content-browser-cat-dot" />
                  {cat}
                </button>
              ))}
            </div>
          ) : (
            <div className="content-browser-breadcrumbs">
              <button
                type="button"
                className="content-browser-crumb-btn"
                onClick={goUp}
                disabled={currentPath === "."}
                title="Eine Ebene hoch (Backspace)"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                className={`content-browser-crumb${currentPath === "." ? " active" : ""}`}
                onClick={() => setCurrentPath(".")}
              >
                Workspace
              </button>
              {crumbs.map((c) => (
                <span key={c.path} className="content-browser-crumb-group">
                  <ChevronRight size={12} className="content-browser-crumb-sep" />
                  <button
                    type="button"
                    className={`content-browser-crumb${c.path === currentPath ? " active" : ""}`}
                    onClick={() => setCurrentPath(c.path)}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          <button className="content-browser-close" onClick={onClose} title="Schließen (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="content-browser-body">
          {loading ? (
            <div className="content-browser-empty">Lade…</div>
          ) : isTreeTab && treeError ? (
            <div className="content-browser-empty">{treeError}</div>
          ) : tiles.length === 0 ? (
            <div className="content-browser-empty">
              {query.trim() ? "Keine Treffer" : "Nichts gefunden"}
            </div>
          ) : (
            <div className="content-browser-grid">
              {tiles.map((tile, i) => (
                <div
                  key={tile.key}
                  className={`content-browser-tile${i === safeIdx ? " selected" : ""}${tile.directory ? " content-browser-tile--folder" : ""}`}
                  style={
                    tile.category
                      ? ({ "--cat-hue": categoryHue(tile.category) } as React.CSSProperties)
                      : undefined
                  }
                  draggable={!tile.directory}
                  onDragStart={
                    tile.directory
                      ? undefined
                      : (e) => {
                          e.dataTransfer.setData("text/plain", `@[${tile.name}](${tile.path})`);
                          e.dataTransfer.effectAllowed = "copy";
                        }
                  }
                  onMouseEnter={() => setSelectedIdx(i)}
                  onDoubleClick={() => openTile(tile)}
                  title={
                    tile.directory
                      ? `${tile.name}\n\nDoppelklick: öffnen`
                      : `${tile.path}\n\nDoppelklick: öffnen · Ziehen: als Verweis einfügen`
                  }
                >
                  <div className="content-browser-thumb">
                    {tile.directory ? (
                      <Folder size={26} strokeWidth={1.5} />
                    ) : (
                      <FileText size={26} strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="content-browser-tile-name">{tile.name}</div>
                  {tile.snippet ? (
                    <div className="content-browser-tile-snippet">{tile.snippet}</div>
                  ) : tile.category ? (
                    <div className="content-browser-tile-cat">
                      <FolderOpen size={11} /> {tile.category}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="content-browser-footer">
          <span>{tiles.length} Einträge</span>
          <span className="content-browser-footer-hint">
            {isTreeTab ? "Doppelklick öffnet · Backspace zurück" : "Doppelklick öffnet · Ziehen fügt Verweis ein"} ·
            Strg+1/2/3 wechselt Tab · Esc schließt
          </span>
        </div>
      </div>
    </div>
  );
}
