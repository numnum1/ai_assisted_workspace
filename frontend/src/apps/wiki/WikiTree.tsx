import { useState, useEffect, useCallback, useRef, useMemo, type DragEvent, type ReactNode } from "react";
import { ChevronRight, ChevronDown, Folder, File, FolderPlus, Search, RotateCcw, X } from "lucide-react";
import { filesApi, wikiApi, windowApi } from "../../shared/api.ts";
import type { FileNode } from "../../shared/types.ts";
import { useTextPrompt } from "../../shared/hooks/useTextPrompt.tsx";
import {
  FILE_TREE_INTERNAL_DRAG_MIME,
  canDropTreeItemOntoFolder,
  setFileTreeNativeDragCursor,
} from "../../shared/utils/fileTreeDrag.ts";
import "./WikiWindow.css";

const EXPANDED_STORAGE_KEY = "wiki-window-outliner-expanded-v1";

function readExpanded(projectPath: string): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(parsed[projectPath]) ? parsed[projectPath] : [];
  } catch {
    return [];
  }
}

function writeExpanded(projectPath: string, paths: Iterable<string>): void {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    parsed[projectPath] = [...paths];
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function findWikiRoot(root: FileNode | null): FileNode | null {
  if (!root?.children) return null;
  return root.children.find((c) => c.directory && c.name.toLowerCase() === "wiki") ?? null;
}

function normalizeItemName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes("/") || t.includes("\\")) {
    window.alert("Der Name darf keine Pfadtrenner enthalten.");
    return null;
  }
  return t;
}

interface SearchHit {
  path: string;
  title: string;
  snippet: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  directory: boolean;
}

interface WikiTreeProps {
  projectPath: string | null;
}

export function WikiTree({ projectPath }: WikiTreeProps) {
  const [root, setRoot] = useState<FileNode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["wiki"]));
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [promptDialog, prompt] = useTextPrompt();
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const dragSourceRef = useRef<{ path: string; isDirectory: boolean } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const expandedLoadedForRef = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!projectPath) {
      setRoot(null);
      return;
    }
    filesApi
      .getTree()
      .then((tree) => {
        setRoot(tree);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Baum konnte nicht geladen werden"));
  }, [projectPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!projectPath || expandedLoadedForRef.current === projectPath) return;
    expandedLoadedForRef.current = projectPath;
    setExpanded(new Set(["wiki", ...readExpanded(projectPath)]));
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || expandedLoadedForRef.current !== projectPath) return;
    writeExpanded(projectPath, expanded);
  }, [projectPath, expanded]);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => () => setFileTreeNativeDragCursor(false), []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchHits(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void wikiApi.search(trimmed, 60).then((hits) => {
        if (cancelled) return;
        setSearchHits(
          hits.map((h) => ({ path: h.path, title: h.title, snippet: h.snippet })),
        );
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const wikiRoot = useMemo(() => findWikiRoot(root), [root]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const runMutation = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setMenu(null);
        load();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
      }
    },
    [load],
  );

  const openEntry = useCallback((path: string) => {
    void windowApi.open("wikiEntry", { path });
  }, []);

  const handleCreateWikiFolder = useCallback(() => {
    void runMutation(() => filesApi.createFolder(".", "wiki"));
  }, [runMutation]);

  const handleNewFolder = async (parentPath: string) => {
    setMenu(null);
    const name = await prompt("Name des neuen Ordners:");
    const n = name != null ? normalizeItemName(name) : null;
    if (n == null) return;
    void runMutation(() => filesApi.createFolder(parentPath, n));
  };

  const handleNewFile = async (parentPath: string) => {
    setMenu(null);
    const name = await prompt("Name des neuen Eintrags:", "unbenannt.md");
    const n = name != null ? normalizeItemName(name) : null;
    if (n == null) return;
    void runMutation(() => filesApi.createFile(parentPath, n));
  };

  const handleRename = async (path: string, isDir: boolean) => {
    setMenu(null);
    const base = path.split("/").pop() ?? "";
    const next = await prompt(isDir ? "Neuer Ordnername:" : "Neuer Dateiname:", base);
    const n = next != null ? normalizeItemName(next) : null;
    if (n == null) return;
    void runMutation(() => filesApi.rename(path, n));
  };

  const handleDuplicate = (path: string) => {
    void runMutation(() => filesApi.copy(path));
  };

  const handleDelete = (path: string, isDir: boolean) => {
    const msg = isDir
      ? `Ordner „${path}" und alle Inhalte wirklich löschen?`
      : `Eintrag „${path}" wirklich löschen?`;
    if (!window.confirm(msg)) return;
    void runMutation(() => filesApi.deleteContent(path));
  };

  const onFolderDragOver = useCallback((e: DragEvent, folderPath: string) => {
    const mimeLc = FILE_TREE_INTERNAL_DRAG_MIME.toLowerCase();
    if (!Array.from(e.dataTransfer.types).some((t) => t.toLowerCase() === mimeLc)) return;
    const src = dragSourceRef.current;
    if (!src) return;
    if (!canDropTreeItemOntoFolder(src.path, src.isDirectory, folderPath)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(folderPath);
  }, []);

  const onFolderDrop = useCallback(
    (e: DragEvent, folderPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const raw = e.dataTransfer.getData(FILE_TREE_INTERNAL_DRAG_MIME);
      dragSourceRef.current = null;
      if (!raw) return;
      let sourcePath: string;
      let sourceIsDir: boolean;
      try {
        const p = JSON.parse(raw) as { path?: string; isDirectory?: boolean };
        if (typeof p.path !== "string") return;
        sourcePath = p.path;
        sourceIsDir = Boolean(p.isDirectory);
      } catch {
        return;
      }
      if (!canDropTreeItemOntoFolder(sourcePath, sourceIsDir, folderPath)) return;
      void runMutation(async () => {
        await filesApi.move(sourcePath, folderPath);
        setExpanded((prev) => new Set(prev).add(folderPath));
      });
    },
    [runMutation],
  );

  const renderNode = (node: FileNode, depth: number): ReactNode => {
    const isDir = node.directory;
    const isOpen = expanded.has(node.path);
    const isRoot = node.path === "wiki";
    const dropHighlight = isDir && dropTarget === node.path ? " wiki-tree-row--drop-target" : "";

    return (
      <div key={node.path}>
        <button
          type="button"
          className={`wiki-tree-row${dropHighlight}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => (isDir ? toggle(node.path) : openEntry(node.path))}
          onDoubleClick={() => !isDir && openEntry(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, path: node.path, directory: isDir });
          }}
          draggable={!isRoot}
          onDragStart={
            isRoot
              ? undefined
              : (e) => {
                  setFileTreeNativeDragCursor(true);
                  dragSourceRef.current = { path: node.path, isDirectory: isDir };
                  e.dataTransfer.setData(
                    FILE_TREE_INTERNAL_DRAG_MIME,
                    JSON.stringify({ path: node.path, isDirectory: isDir }),
                  );
                  e.dataTransfer.effectAllowed = "move";
                }
          }
          onDragEnd={
            isRoot
              ? undefined
              : () => {
                  setFileTreeNativeDragCursor(false);
                  dragSourceRef.current = null;
                  setDropTarget(null);
                }
          }
          onDragOver={isDir ? (e) => onFolderDragOver(e, node.path) : undefined}
          onDrop={isDir ? (e) => onFolderDrop(e, node.path) : undefined}
        >
          <span className="wiki-tree-chevron">
            {isDir ? (
              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="wiki-tree-chevron-spacer" />
            )}
          </span>
          {isDir ? <Folder size={14} className="wiki-tree-icon" /> : <File size={14} className="wiki-tree-icon" />}
          <span className="wiki-tree-name">{node.name}</span>
        </button>
        {isDir &&
          isOpen &&
          node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const showCreate = menu?.directory === true;
  const showRenameDelete = menu != null && menu.path !== "wiki";

  return (
    <div className="wiki-tree">
      <div className="wiki-tree-header">
        <span className="wiki-tree-header-title">Wiki</span>
        <button type="button" className="wiki-tree-header-btn" onClick={load} title="Neu laden">
          <RotateCcw size={13} />
        </button>
      </div>
      <div className="wiki-tree-search-row">
        <Search size={14} className="wiki-tree-search-icon" />
        <input
          className="wiki-tree-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Wiki durchsuchen…"
        />
        {query && (
          <button type="button" className="wiki-tree-search-clear" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="wiki-tree-scroll">
        {loadError && <div className="wiki-tree-empty">{loadError}</div>}
        {!root && !loadError && projectPath && <div className="wiki-tree-empty">Laden…</div>}
        {!projectPath && <div className="wiki-tree-empty">Kein Projekt geöffnet.</div>}
        {searchHits ? (
          searchHits.length === 0 ? (
            <div className="wiki-tree-empty">Keine Treffer</div>
          ) : (
            searchHits.map((hit) => (
              <button
                key={hit.path}
                type="button"
                className="wiki-tree-search-hit"
                onDoubleClick={() => openEntry(`wiki/${hit.path}`)}
                title={`${hit.path}\n\nDoppelklick: öffnen`}
              >
                <div className="wiki-tree-search-hit-title">{hit.title}</div>
                {hit.snippet && <div className="wiki-tree-search-hit-snippet">{hit.snippet}</div>}
              </button>
            ))
          )
        ) : root && !wikiRoot ? (
          <div className="wiki-tree-empty">
            <p>Kein Wiki-Ordner gefunden.</p>
            <button type="button" className="wiki-tree-create-btn" onClick={handleCreateWikiFolder}>
              <FolderPlus size={14} />
              Wiki-Ordner anlegen
            </button>
          </div>
        ) : (
          wikiRoot && renderNode(wikiRoot, 0)
        )}
      </div>
      {menu && (
        <div
          className="wiki-tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {showCreate && (
            <>
              <button type="button" className="wiki-tree-context-item" onClick={() => void handleNewFolder(menu.path)}>
                Neuer Ordner…
              </button>
              <button type="button" className="wiki-tree-context-item" onClick={() => void handleNewFile(menu.path)}>
                Neuer Eintrag…
              </button>
            </>
          )}
          {showRenameDelete && (
            <>
              {showCreate && <div className="wiki-tree-context-separator" role="separator" />}
              <button
                type="button"
                className="wiki-tree-context-item"
                onClick={() => void handleRename(menu.path, menu.directory)}
              >
                Umbenennen…
              </button>
              {!menu.directory && (
                <button type="button" className="wiki-tree-context-item" onClick={() => handleDuplicate(menu.path)}>
                  Duplizieren
                </button>
              )}
              <button
                type="button"
                className="wiki-tree-context-item wiki-tree-context-item--danger"
                onClick={() => handleDelete(menu.path, menu.directory)}
              >
                Löschen…
              </button>
            </>
          )}
        </div>
      )}
      {promptDialog}
    </div>
  );
}
