import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Folder, FileText, X, FolderOpen } from "lucide-react";
import { chapterApi, filesApi, wikiApi } from "../../api.ts";
import { collectBookProjects } from "../../utils/bookProjects.ts";
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

interface WikiTile {
  key: string;
  name: string;
  category: string;
  snippet?: string;
  /** Project-relative path to open. */
  path: string;
}

interface ChapterRow {
  key: string;
  chapterId: string;
  title: string;
  projectPath: string;
  projectName: string;
  subprojectType: string | null;
}

interface ContentBrowserOverlayProps {
  open: boolean;
  projectPath: string | null;
  onClose: () => void;
  /** Opens a project-relative path in the editor (used by the Wiki column). */
  onSelectFile: (path: string) => void;
  /** Opens a chapter within its owning book project (project root when structureRoot is null). */
  onSelectChapter: (chapterId: string, structureRoot: string | null, subprojectType: string | null) => void;
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
  onSelectChapter,
}: ContentBrowserOverlayProps) {
  const [focusedColumn, setFocusedColumn] = useState<Column>("buch");

  // --- Chapter data (left column) ---
  const [root, setRoot] = useState<FileNode | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [chapterRows, setChapterRows] = useState<ChapterRow[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
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
    setWikiQuery("");
    setWikiIdx(0);
    setActiveCategory(null);
    setWikiSearchHits(null);
    setFocusedColumn("buch");

    setChaptersLoading(true);
    setTreeError(null);
    filesApi
      .getTree()
      .then((tree) => {
        if (!cancelled) setRoot(tree);
      })
      .catch((e) => {
        if (!cancelled) {
          setTreeError(e instanceof Error ? e.message : "Baum konnte nicht geladen werden");
          setChaptersLoading(false);
        }
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

  // Once the file tree is in, load every book project's chapter list.
  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    const projects = collectBookProjects(root);
    setChaptersLoading(true);
    Promise.all(
      projects.map((project) =>
        chapterApi
          .list(project.path === "." ? undefined : project.path)
          .then((list) => ({ project, list }))
          .catch(() => ({ project, list: [] })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const rows: ChapterRow[] = [];
      for (const { project, list } of results) {
        for (const c of list) {
          rows.push({
            key: `${project.path}::${c.id}`,
            chapterId: c.id,
            title: c.meta.title || c.id,
            projectPath: project.path,
            projectName: project.name,
            subprojectType: project.subprojectType,
          });
        }
      }
      setChapterRows(rows);
      setChaptersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [root]);

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

  const chapterGroups = useMemo(() => {
    const trimmed = chapterQuery.trim().toLowerCase();
    const filtered = trimmed
      ? chapterRows.filter(
          (r) =>
            r.title.toLowerCase().includes(trimmed) || r.projectName.toLowerCase().includes(trimmed),
        )
      : chapterRows;
    const groups: { projectPath: string; projectName: string; rows: ChapterRow[] }[] = [];
    for (const row of filtered) {
      let group = groups.find((g) => g.projectPath === row.projectPath);
      if (!group) {
        group = { projectPath: row.projectPath, projectName: row.projectName, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  }, [chapterRows, chapterQuery]);

  const flatChapterRows = useMemo(() => chapterGroups.flatMap((g) => g.rows), [chapterGroups]);

  const wikiTiles = useMemo<WikiTile[]>(() => {
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
      category: a.category,
      snippet: a.snippet,
      path: `wiki/${a.path}`,
    }));
  }, [allWikiAssets, wikiSearchHits, activeCategory, wikiQuery]);

  const safeChapterIdx =
    flatChapterRows.length === 0 ? 0 : Math.min(chapterIdx, flatChapterRows.length - 1);
  const safeWikiIdx = wikiTiles.length === 0 ? 0 : Math.min(wikiIdx, wikiTiles.length - 1);

  const openChapterRow = useCallback(
    (row: ChapterRow) => {
      onSelectChapter(row.chapterId, row.projectPath === "." ? null : row.projectPath, row.subprojectType);
    },
    [onSelectChapter],
  );

  const openWikiTile = useCallback(
    (tile: WikiTile) => {
      onSelectFile(tile.path);
    },
    [onSelectFile],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (focusedColumn === "buch") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setChapterIdx((i) => Math.min(i + 1, flatChapterRows.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setChapterIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && flatChapterRows[safeChapterIdx]) {
          e.preventDefault();
          openChapterRow(flatChapterRows[safeChapterIdx]);
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
          openWikiTile(wikiTiles[safeWikiIdx]);
        }
      }
    },
    [
      focusedColumn,
      flatChapterRows,
      safeChapterIdx,
      openChapterRow,
      wikiTiles,
      safeWikiIdx,
      openWikiTile,
      onClose,
    ],
  );

  if (!open) return null;

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
            </div>

            <div className="content-browser-body content-browser-list-body">
              {chaptersLoading ? (
                <div className="content-browser-empty">Lade…</div>
              ) : treeError ? (
                <div className="content-browser-empty">{treeError}</div>
              ) : flatChapterRows.length === 0 ? (
                <div className="content-browser-empty">
                  {chapterQuery.trim() ? "Keine Treffer" : "Keine Kapitel gefunden"}
                </div>
              ) : (
                (() => {
                  let rowIdx = -1;
                  return chapterGroups.map((group) => (
                    <div key={group.projectPath} className="content-browser-chapter-group">
                      <div className="content-browser-chapter-group-header">
                        <Folder size={12} strokeWidth={1.75} />
                        <span>{group.projectName}</span>
                      </div>
                      <div className="content-browser-list">
                        {group.rows.map((row) => {
                          rowIdx += 1;
                          const i = rowIdx;
                          return (
                            <div
                              key={row.key}
                              className={`content-browser-list-row${i === safeChapterIdx ? " selected" : ""}`}
                              onMouseEnter={() => setChapterIdx(i)}
                              onDoubleClick={() => openChapterRow(row)}
                              title={`${row.title}\n\nDoppelklick: öffnen`}
                            >
                              <FileText size={16} strokeWidth={1.5} className="content-browser-list-icon" />
                              <span className="content-browser-list-name">{row.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>

            <div className="content-browser-footer">
              <span>{flatChapterRows.length} Kapitel</span>
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
                      style={{ "--cat-hue": categoryHue(tile.category) } as React.CSSProperties}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", `@[${tile.name}](${tile.path})`);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onMouseEnter={() => setWikiIdx(i)}
                      onDoubleClick={() => openWikiTile(tile)}
                      title={`${tile.path}\n\nDoppelklick: öffnen · Ziehen: als Verweis einfügen`}
                    >
                      <div className="content-browser-thumb">
                        <FileText size={26} strokeWidth={1.5} />
                      </div>
                      <div className="content-browser-tile-name">{tile.name}</div>
                      {tile.snippet ? (
                        <div className="content-browser-tile-snippet">{tile.snippet}</div>
                      ) : (
                        <div className="content-browser-tile-cat">
                          <FolderOpen size={11} /> {tile.category}
                        </div>
                      )}
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
          Doppelklick öffnet · Ziehen fügt Verweis ein (Wiki) · Pfeiltasten navigieren · Esc schließt
        </div>
      </div>
    </div>
  );
}
