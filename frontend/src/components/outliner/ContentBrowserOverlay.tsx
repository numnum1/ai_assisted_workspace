import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Folder, FileText, X, ChevronRight, ArrowUp, FolderOpen } from "lucide-react";
import { filesApi, wikiApi } from "../../api.ts";
import type { FileNode } from "../../types.ts";
import "./ContentBrowserOverlay.css";

type Column = "buch" | "wiki";

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

export function ContentBrowserOverlay({
  open,
  projectPath,
  onClose,
  onSelectFile,
}: ContentBrowserOverlayProps) {
  const [focusedColumn, setFocusedColumn] = useState<Column>("buch");

  // --- Tree data (chapters, left column) ---
  const [root, setRoot] = useState<FileNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(".");
  const [chapterQuery, setChapterQuery] = useState("");
  const [chapterIdx, setChapterIdx] = useState(0);
  const chapterInputRef = useRef<HTMLInputElement>(null);

  // --- Wiki data (right column) ---
  const [allWikiAssets, setAllWikiAssets] = useState<WikiAsset[]>([]);
  const [wikiSearchHits, setWikiSearchHits] = useState<WikiAsset[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(true);
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiIdx, setWikiIdx] = useState(0);
  const wikiInputRef = useRef<HTMLInputElement>(null);

  // Reset navigation state and (re)load data each time the popup opens.
  useEffect(() => {
    if (!open || !projectPath) return;
    let cancelled = false;
    setChapterQuery("");
    setChapterIdx(0);
    setCurrentPath(".");
    setWikiQuery("");
    setWikiIdx(0);
    setActiveCategory(null);
    setWikiSearchHits(null);
    setFocusedColumn("buch");

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

    const focusTimer = setTimeout(() => chapterInputRef.current?.focus(), 60);
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [open, projectPath]);

  // Full-text wiki search (debounced).
  useEffect(() => {
    const trimmed = wikiQuery.trim();
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
  }, [wikiQuery]);

  const wikiCategories = useMemo(() => {
    const set = new Set(allWikiAssets.map((a) => a.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allWikiAssets]);

  const currentNode = useMemo(() => {
    if (!root) return null;
    return findNodeByPath(root, currentPath);
  }, [root, currentPath]);

  const chapterTiles = useMemo<Tile[]>(() => {
    const children = currentNode?.children ?? [];
    const visible = children.filter((n) => !(n.directory && n.name.toLowerCase() === "wiki"));
    const trimmed = chapterQuery.trim().toLowerCase();
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
  }, [currentNode, chapterQuery]);

  const wikiTiles = useMemo<Tile[]>(() => {
    const trimmed = wikiQuery.trim().toLowerCase();
    let base: WikiAsset[];
    if (!trimmed) {
      base = allWikiAssets;
    } else {
      const byName = allWikiAssets.filter((a) => a.displayName.toLowerCase().includes(trimmed));
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
  }, [allWikiAssets, wikiSearchHits, activeCategory, wikiQuery]);

  const safeChapterIdx = chapterTiles.length === 0 ? 0 : Math.min(chapterIdx, chapterTiles.length - 1);
  const safeWikiIdx = wikiTiles.length === 0 ? 0 : Math.min(wikiIdx, wikiTiles.length - 1);

  const openTile = useCallback(
    (tile: Tile) => {
      if (tile.directory) {
        setCurrentPath(tile.path);
        setChapterQuery("");
        setChapterIdx(0);
        chapterInputRef.current?.focus();
      } else {
        onSelectFile(tile.path);
      }
    },
    [onSelectFile],
  );

  const goUp = useCallback(() => {
    if (currentPath === ".") return;
    setCurrentPath(parentPath(currentPath));
    setChapterQuery("");
    setChapterIdx(0);
  }, [currentPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (focusedColumn === "buch") {
        if (e.key === "Backspace" && !chapterQuery) {
          e.preventDefault();
          goUp();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setChapterIdx((i) => Math.min(i + 1, chapterTiles.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setChapterIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && chapterTiles[safeChapterIdx]) {
          e.preventDefault();
          openTile(chapterTiles[safeChapterIdx]);
        }
      } else {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setWikiIdx((i) => Math.min(i + 1, wikiTiles.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setWikiIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && wikiTiles[safeWikiIdx]) {
          e.preventDefault();
          openTile(wikiTiles[safeWikiIdx]);
        }
      }
    },
    [focusedColumn, chapterQuery, chapterTiles, safeChapterIdx, wikiTiles, safeWikiIdx, openTile, goUp, onClose],
  );

  if (!open) return null;

  const crumbs = breadcrumbSegments(currentPath);

  return (
    <div className="content-browser-overlay" onClick={onClose}>
      <div
        className="content-browser-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="content-browser-topbar">
          <span className="content-browser-title">Content Browser</span>
          <button className="content-browser-close" onClick={onClose} title="Schließen (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="content-browser-columns">
          <div
            className="content-browser-col content-browser-col-left"
            onFocus={() => setFocusedColumn("buch")}
            onMouseEnter={() => setFocusedColumn("buch")}
          >
            <div className="content-browser-col-title-row">
              <span className="content-browser-col-title">Kapitel</span>
            </div>

            <div className="content-browser-header">
              <div className="content-browser-search-row">
                <Search size={15} className="content-browser-search-icon" />
                <input
                  ref={chapterInputRef}
                  className="content-browser-search-input"
                  value={chapterQuery}
                  onFocus={() => setFocusedColumn("buch")}
                  onChange={(e) => {
                    setChapterQuery(e.target.value);
                    setChapterIdx(0);
                  }}
                  placeholder="Kapitel suchen…"
                />
              </div>

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
            </div>

            <div className="content-browser-body content-browser-list-body">
              {treeLoading ? (
                <div className="content-browser-empty">Lade…</div>
              ) : treeError ? (
                <div className="content-browser-empty">{treeError}</div>
              ) : chapterTiles.length === 0 ? (
                <div className="content-browser-empty">
                  {chapterQuery.trim() ? "Keine Treffer" : "Nichts gefunden"}
                </div>
              ) : (
                <div className="content-browser-list">
                  {chapterTiles.map((tile, i) => (
                    <div
                      key={tile.key}
                      className={`content-browser-list-row${i === safeChapterIdx ? " selected" : ""}${tile.directory ? " content-browser-list-row--folder" : ""}`}
                      draggable={!tile.directory}
                      onDragStart={
                        tile.directory
                          ? undefined
                          : (e) => {
                              e.dataTransfer.setData("text/plain", `@[${tile.name}](${tile.path})`);
                              e.dataTransfer.effectAllowed = "copy";
                            }
                      }
                      onMouseEnter={() => setChapterIdx(i)}
                      onDoubleClick={() => openTile(tile)}
                      title={
                        tile.directory
                          ? `${tile.name}\n\nDoppelklick: öffnen`
                          : `${tile.path}\n\nDoppelklick: öffnen · Ziehen: als Verweis einfügen`
                      }
                    >
                      {tile.directory ? (
                        <Folder size={16} strokeWidth={1.5} className="content-browser-list-icon" />
                      ) : (
                        <FileText size={16} strokeWidth={1.5} className="content-browser-list-icon" />
                      )}
                      <span className="content-browser-list-name">{tile.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="content-browser-footer">
              <span>{chapterTiles.length} Einträge</span>
            </div>
          </div>

          <div
            className="content-browser-col content-browser-col-right"
            onFocus={() => setFocusedColumn("wiki")}
            onMouseEnter={() => setFocusedColumn("wiki")}
          >
            <div className="content-browser-col-title-row">
              <span className="content-browser-col-title">Wiki</span>
            </div>

            <div className="content-browser-header">
              <div className="content-browser-search-row">
                <Search size={15} className="content-browser-search-icon" />
                <input
                  ref={wikiInputRef}
                  className="content-browser-search-input"
                  value={wikiQuery}
                  onFocus={() => setFocusedColumn("wiki")}
                  onChange={(e) => {
                    setWikiQuery(e.target.value);
                    setWikiIdx(0);
                  }}
                  placeholder="Wiki durchsuchen…"
                />
              </div>

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
            </div>

            <div className="content-browser-body">
              {wikiLoading ? (
                <div className="content-browser-empty">Lade…</div>
              ) : wikiTiles.length === 0 ? (
                <div className="content-browser-empty">
                  {wikiQuery.trim() ? "Keine Treffer" : "Nichts gefunden"}
                </div>
              ) : (
                <div className="content-browser-grid">
                  {wikiTiles.map((tile, i) => (
                    <div
                      key={tile.key}
                      className={`content-browser-tile${i === safeWikiIdx ? " selected" : ""}`}
                      style={
                        tile.category
                          ? ({ "--cat-hue": categoryHue(tile.category) } as React.CSSProperties)
                          : undefined
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", `@[${tile.name}](${tile.path})`);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onMouseEnter={() => setWikiIdx(i)}
                      onDoubleClick={() => openTile(tile)}
                      title={`${tile.path}\n\nDoppelklick: öffnen · Ziehen: als Verweis einfügen`}
                    >
                      <div className="content-browser-thumb">
                        <FileText size={26} strokeWidth={1.5} />
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
              <span>{wikiTiles.length} Einträge</span>
            </div>
          </div>
        </div>

        <div className="content-browser-hint-bar">
          Doppelklick öffnet · Ziehen fügt Verweis ein · Pfeiltasten navigieren · Backspace zurück (Kapitel) · Esc
          schließt
        </div>
      </div>
    </div>
  );
}
