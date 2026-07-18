import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  X,
  ChevronRight,
} from "lucide-react";
import { wikiApi } from "../../../../shared/api.ts";
import { useTextPrompt } from "../../hooks/useTextPrompt.tsx";
import "./ContentBrowserOverlay.css";

interface WikiAsset {
  /** Path relative to the wiki root, e.g. "charaktere/anna.md" */
  path: string;
  displayName: string;
  category: string;
  snippet?: string;
}

interface FolderEntry {
  /** Folder path relative to the wiki root ("" is the root itself). */
  folders: Set<string>;
  files: WikiAsset[];
}

type WikiGridItem =
  | { type: "folder"; key: string; name: string; folderPath: string }
  | {
      type: "file";
      key: string;
      name: string;
      category: string;
      snippet?: string;
      /** Project-relative path to open. */
      path: string;
    };

interface ContentBrowserOverlayProps {
  open: boolean;
  projectPath: string | null;
  onClose: () => void;
  /** Opens a project-relative path in the editor. */
  onSelectFile: (path: string) => void;
}

function fileDisplayName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function fileCategory(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[parts.length - 2] : "wiki";
}

function folderDisplayName(folderPath: string): string {
  const name = folderPath.split("/").pop() ?? folderPath;
  return name.replace(/[-_]/g, " ");
}

/** Deterministic hue per category, so each wiki asset type gets a stable accent color. */
function categoryHue(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) % 360;
  }
  return hash;
}

const SHOW_FOLDERS_STORAGE_KEY = "markdown_assistant_content_browser_show_folders_v1";

function readShowFoldersPref(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_FOLDERS_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function writeShowFoldersPref(value: boolean): void {
  try {
    localStorage.setItem(SHOW_FOLDERS_STORAGE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function normalizeFolderName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes("/") || t.includes("\\")) {
    window.alert("Der Name darf keine Pfadtrenner enthalten.");
    return null;
  }
  return t;
}

export function ContentBrowserOverlay({
  open,
  projectPath,
  onClose,
  onSelectFile,
}: ContentBrowserOverlayProps) {
  const [allWikiAssets, setAllWikiAssets] = useState<WikiAsset[]>([]);
  const [allWikiFolders, setAllWikiFolders] = useState<string[]>([]);
  const [wikiSearchHits, setWikiSearchHits] = useState<WikiAsset[] | null>(null);
  const [showFolders, setShowFoldersState] = useState(readShowFoldersPref);
  const setShowFolders = useCallback((value: boolean) => {
    setShowFoldersState(value);
    writeShowFoldersPref(value);
  }, []);
  const [currentFolder, setCurrentFolder] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(true);
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiIdx, setWikiIdx] = useState(0);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const wikiInputRef = useRef<HTMLInputElement>(null);
  const [promptDialog, prompt] = useTextPrompt();

  const reloadWiki = useCallback(() => {
    setWikiLoading(true);
    return Promise.all([wikiApi.listFiles(), wikiApi.listFolders()])
      .then(([paths, folders]) => {
        setAllWikiAssets(
          paths.map((path) => ({
            path,
            displayName: fileDisplayName(path),
            category: fileCategory(path),
          })),
        );
        setAllWikiFolders(folders);
      })
      .finally(() => setWikiLoading(false));
  }, []);

  // Reset navigation state and (re)load data each time the popup opens.
  useEffect(() => {
    if (!open || !projectPath) return;
    setWikiQuery("");
    setWikiIdx(0);
    setCurrentFolder("");
    setActiveCategory(null);
    setWikiSearchHits(null);
    setFolderMenu(null);

    void reloadWiki();

    const focusTimer = setTimeout(() => wikiInputRef.current?.focus(), 60);
    return () => {
      clearTimeout(focusTimer);
    };
  }, [open, projectPath, reloadWiki]);

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

  // Build the folder tree: folder path -> its immediate subfolders and files.
  const folderMap = useMemo(() => {
    const map = new Map<string, FolderEntry>();
    const ensure = (key: string) => {
      let entry = map.get(key);
      if (!entry) {
        entry = { folders: new Set(), files: [] };
        map.set(key, entry);
      }
      return entry;
    };
    ensure("");
    const addFolderPath = (folderPath: string) => {
      const parts = folderPath.split("/");
      let cur = "";
      for (const seg of parts) {
        const parent = cur;
        cur = cur ? `${cur}/${seg}` : seg;
        ensure(parent).folders.add(cur);
        ensure(cur);
      }
    };
    for (const folderPath of allWikiFolders) {
      addFolderPath(folderPath);
    }
    for (const asset of allWikiAssets) {
      const parts = asset.path.split("/");
      parts.pop();
      if (parts.length > 0) addFolderPath(parts.join("/"));
      ensure(parts.join("/")).files.push(asset);
    }
    return map;
  }, [allWikiAssets, allWikiFolders]);

  const breadcrumbSegments = useMemo(() => {
    if (!currentFolder) return [];
    const parts = currentFolder.split("/");
    let acc = "";
    return parts.map((part) => {
      acc = acc ? `${acc}/${part}` : part;
      return { name: folderDisplayName(part), path: acc };
    });
  }, [currentFolder]);

  const wikiCategories = useMemo(() => {
    const set = new Set(allWikiAssets.map((a) => a.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allWikiAssets]);

  const wikiItems = useMemo<WikiGridItem[]>(() => {
    const trimmed = wikiQuery.trim().toLowerCase();

    if (showFolders && !trimmed) {
      const entry = folderMap.get(currentFolder) ?? { folders: new Set<string>(), files: [] };
      const folders: WikiGridItem[] = Array.from(entry.folders)
        .sort((a, b) => folderDisplayName(a).localeCompare(folderDisplayName(b)))
        .map((folderPath) => ({
          type: "folder",
          key: folderPath,
          name: folderDisplayName(folderPath),
          folderPath,
        }));
      const files: WikiGridItem[] = [...entry.files]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((a) => ({
          type: "file",
          key: a.path,
          name: a.displayName,
          category: a.category,
          snippet: a.snippet,
          path: `wiki/${a.path}`,
        }));
      return [...folders, ...files];
    }

    // Flat views: while searching (any mode) or when folders are switched off.
    let base: WikiAsset[];
    if (!trimmed) {
      base = allWikiAssets;
    } else {
      const byName = allWikiAssets.filter((a) =>
        a.displayName.toLowerCase().includes(trimmed),
      );
      base = wikiSearchHits && wikiSearchHits.length > 0 ? wikiSearchHits : byName;
    }
    const filtered =
      !showFolders && activeCategory ? base.filter((a) => a.category === activeCategory) : base;
    return filtered.map((a) => ({
      type: "file",
      key: a.path,
      name: a.displayName,
      category: a.category,
      snippet: a.snippet,
      path: `wiki/${a.path}`,
    }));
  }, [
    showFolders,
    folderMap,
    currentFolder,
    allWikiAssets,
    wikiSearchHits,
    wikiQuery,
    activeCategory,
  ]);

  const safeWikiIdx = wikiItems.length === 0 ? 0 : Math.min(wikiIdx, wikiItems.length - 1);

  const openWikiFile = useCallback(
    (path: string) => {
      onSelectFile(path);
    },
    [onSelectFile],
  );

  const enterFolder = useCallback((folderPath: string) => {
    setCurrentFolder(folderPath);
    setWikiIdx(0);
  }, []);

  const activateItem = useCallback(
    (item: WikiGridItem) => {
      if (item.type === "folder") {
        enterFolder(item.folderPath);
      } else {
        openWikiFile(item.path);
      }
    },
    [enterFolder, openWikiFile],
  );

  // Close the folder context menu on any outside click or Escape.
  useEffect(() => {
    if (!folderMenu) return;
    const close = () => setFolderMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [folderMenu]);

  const handleBodyContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!showFolders || wikiQuery.trim()) return;
      e.preventDefault();
      setFolderMenu({ x: e.clientX, y: e.clientY });
    },
    [showFolders, wikiQuery],
  );

  const handleNewFolder = useCallback(async () => {
    setFolderMenu(null);
    const raw = await prompt("Name des neuen Ordners:");
    const name = raw != null ? normalizeFolderName(raw) : null;
    if (name == null) return;
    try {
      await wikiApi.createFolder(currentFolder, name);
      await reloadWiki();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ordner konnte nicht erstellt werden");
    }
  }, [currentFolder, prompt, reloadWiki]);

  const handleNewFile = useCallback(async () => {
    setFolderMenu(null);
    if (!currentFolder) return;
    const raw = await prompt("Name des neuen Wiki-Eintrags:", "unbenannt.md");
    const name = raw != null ? normalizeFolderName(raw) : null;
    if (name == null) return;
    try {
      const { path: newPath } = await wikiApi.createFile(currentFolder, name);
      await reloadWiki();
      onSelectFile(`wiki/${newPath}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Eintrag konnte nicht erstellt werden");
    }
  }, [currentFolder, prompt, reloadWiki, onSelectFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (folderMenu) {
          setFolderMenu(null);
        } else {
          onClose();
        }
        return;
      }
      if (showFolders && e.key === "Backspace" && !wikiQuery && currentFolder) {
        e.preventDefault();
        const parts = currentFolder.split("/");
        parts.pop();
        enterFolder(parts.join("/"));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setWikiIdx((i) => Math.min(i + 1, wikiItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setWikiIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && wikiItems[safeWikiIdx]) {
        e.preventDefault();
        activateItem(wikiItems[safeWikiIdx]);
      }
    },
    [
      wikiItems,
      safeWikiIdx,
      activateItem,
      onClose,
      wikiQuery,
      currentFolder,
      enterFolder,
      showFolders,
      folderMenu,
    ],
  );

  if (!open) return null;

  const showBreadcrumbs = showFolders && !wikiQuery.trim();
  const showCategoryTabs = !showFolders;

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
          <div className="content-browser-col content-browser-col-right">
            <div className="content-browser-header">
              <div className="content-browser-search-row">
                <Search size={15} className="content-browser-search-icon" />
                <input
                  ref={wikiInputRef}
                  className="content-browser-search-input"
                  value={wikiQuery}
                  onChange={(e) => {
                    setWikiQuery(e.target.value);
                    setWikiIdx(0);
                  }}
                  placeholder="Wiki durchsuchen…"
                />
                <label className="content-browser-folder-toggle">
                  <input
                    type="checkbox"
                    checked={showFolders}
                    onChange={(e) => setShowFolders(e.target.checked)}
                  />
                  Zeige Ordner
                </label>
              </div>

              {showBreadcrumbs && (
                <div className="content-browser-breadcrumbs">
                  <button
                    className={`content-browser-crumb${currentFolder === "" ? " active" : ""}`}
                    onClick={() => enterFolder("")}
                  >
                    Wiki
                  </button>
                  {breadcrumbSegments.map((seg) => (
                    <span key={seg.path} className="content-browser-crumb-group">
                      <ChevronRight size={13} className="content-browser-crumb-sep" />
                      <button
                        className={`content-browser-crumb${currentFolder === seg.path ? " active" : ""}`}
                        onClick={() => enterFolder(seg.path)}
                      >
                        {seg.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {showCategoryTabs && (
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
              )}
            </div>

            <div className="content-browser-body" onContextMenu={handleBodyContextMenu}>
              {wikiLoading ? (
                <div className="content-browser-empty">Lade…</div>
              ) : wikiItems.length === 0 ? (
                <div className="content-browser-empty">
                  {wikiQuery.trim() ? "Keine Treffer" : "Kein Inhalt in diesem Ordner"}
                </div>
              ) : (
                <div className="content-browser-grid">
                  {wikiItems.map((item, i) =>
                    item.type === "folder" ? (
                      <div
                        key={item.key}
                        className={`content-browser-tile content-browser-tile-folder${i === safeWikiIdx ? " selected" : ""}`}
                        onMouseEnter={() => setWikiIdx(i)}
                        onDoubleClick={() => enterFolder(item.folderPath)}
                        title={`${item.name}\n\nDoppelklick: öffnen`}
                      >
                        <div className="content-browser-thumb content-browser-thumb-folder">
                          <Folder size={26} strokeWidth={1.5} />
                        </div>
                        <div className="content-browser-tile-name">{item.name}</div>
                      </div>
                    ) : (
                      <div
                        key={item.key}
                        className={`content-browser-tile${i === safeWikiIdx ? " selected" : ""}`}
                        style={{ "--cat-hue": categoryHue(item.category) } as React.CSSProperties}
                        onMouseEnter={() => setWikiIdx(i)}
                        onDoubleClick={() => openWikiFile(item.path)}
                        title={`${item.path}\n\nDoppelklick: öffnen`}
                      >
                        <div className="content-browser-thumb">
                          <FileText size={26} strokeWidth={1.5} />
                        </div>
                        <div className="content-browser-tile-name">{item.name}</div>
                        {item.snippet ? (
                          <div className="content-browser-tile-snippet">{item.snippet}</div>
                        ) : (
                          !showFolders && (
                            <div className="content-browser-tile-cat">
                              <FolderOpen size={11} /> {item.category}
                            </div>
                          )
                        )}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="content-browser-footer">
              <span>{wikiItems.length} Einträge</span>
            </div>
          </div>
        </div>

        <div className="content-browser-hint-bar">
          Doppelklick öffnet · Pfeiltasten navigieren
          {showFolders ? " · Backspace geht zurück · Rechtsklick: neuer Ordner/Eintrag" : ""} · Esc
          schließt
        </div>
      </div>

      {folderMenu && (
        <div
          className="content-browser-context-menu"
          style={{ left: folderMenu.x, top: folderMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="content-browser-context-menu-item"
            onClick={() => void handleNewFolder()}
          >
            <FolderPlus size={14} />
            Neuer Ordner
          </button>
          {currentFolder && (
            <button
              className="content-browser-context-menu-item"
              onClick={() => void handleNewFile()}
            >
              <FilePlus size={14} />
              Neuer Wiki-Eintrag
            </button>
          )}
        </div>
      )}

      {promptDialog && <div onClick={(e) => e.stopPropagation()}>{promptDialog}</div>}
    </div>
  );
}
