import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import type { FieldRendererProps } from "../metaSchema.ts";
import { wikiApi } from "../../api.ts";

interface WikiFile {
  path: string;
  displayName: string;
  category: string;
}

// Shared cache with wikiinput
let _cache: WikiFile[] | null = null;
let _cacheLoading = false;
const _cacheListeners: Array<() => void> = [];

function fileDisplayName(path: string): string {
  const parts = path.split("/");
  return (parts[parts.length - 1] ?? "").replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function fileCategory(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[parts.length - 2] : "wiki";
}

async function loadCache(): Promise<void> {
  if (_cache !== null || _cacheLoading) return;
  _cacheLoading = true;
  try {
    const paths = await wikiApi.listFiles();
    _cache = paths.map((path) => ({
      path,
      displayName: fileDisplayName(path),
      category: fileCategory(path),
    }));
    _cacheListeners.forEach((fn) => fn());
    _cacheListeners.length = 0;
  } finally {
    _cacheLoading = false;
  }
}

/** Parse all @[name](path) mentions from a string into individual items. */
function parseMentions(value: string): Array<{ name: string; wikiPath: string }> {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const items: Array<{ name: string; wikiPath: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    items.push({ name: m[1].trim(), wikiPath: m[2].trim() });
  }
  return items;
}

/** Serialise items back to the mention-string format. */
function serialiseMentions(items: Array<{ name: string; wikiPath: string }>): string {
  return items.map((i) => `@[${i.name}](${i.wikiPath})`).join(" ");
}

export function wikiListRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  const items = parseMentions(value);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const [inputVal, setInputVal] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<WikiFile[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cacheReady, setCacheReady] = useState(_cache !== null);
  const [dropdownTop, setDropdownTop] = useState(0);

  useEffect(() => {
    _cache = null;
    setCacheReady(false);
  }, []);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setFilteredFiles([]);
    setActiveIdx(0);
  }, []);

  const filterFiles = useCallback((query: string) => {
    if (!_cache) return;
    const q = query.toLowerCase();
    const hits = _cache.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q),
    );
    setFilteredFiles(hits.slice(0, 12));
    setActiveIdx(0);
  }, []);

  useEffect(() => {
    if (cacheReady && mentionQuery !== null) filterFiles(mentionQuery);
  }, [cacheReady, mentionQuery, filterFiles]);

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(serialiseMentions(next));
  };

  const insertMention = useCallback(
    (file: WikiFile) => {
      const newItem = { name: file.displayName, wikiPath: `wiki/${file.path}` };
      // Avoid duplicates
      const already = items.some((i) => i.wikiPath === newItem.wikiPath);
      if (!already) {
        onChange(serialiseMentions([...items, newItem]));
      }
      setInputVal("");
      closeMention();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [items, onChange, closeMention],
  );

  const calcDropdownTop = useCallback(() => {
    const inp = inputRef.current;
    const wrap = wrapRef.current;
    if (!inp || !wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const inpRect = inp.getBoundingClientRect();
    setDropdownTop(inpRect.bottom - wrapRect.top + 4);
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputVal(val);

      const cursor = e.target.selectionStart ?? 0;
      const textBefore = val.slice(0, cursor);
      const atIdx = textBefore.lastIndexOf("@");

      if (atIdx === -1 || /[\s\n]/.test(textBefore.slice(atIdx + 1))) {
        closeMention();
        return;
      }

      const fragment = textBefore.slice(atIdx + 1);
      setMentionQuery(fragment);
      calcDropdownTop();

      if (_cache === null) {
        _cacheListeners.push(() => setCacheReady(true));
        loadCache();
      } else {
        filterFiles(fragment);
      }
    },
    [closeMention, calcDropdownTop, filterFiles],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionQuery !== null) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filteredFiles.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
        if ((e.key === "Enter" || e.key === "Tab") && filteredFiles.length > 0) {
          e.preventDefault();
          insertMention(filteredFiles[activeIdx]);
          return;
        }
        if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
      }
      if (e.key === "Enter") { e.preventDefault(); onCommit?.(); }
    },
    [mentionQuery, filteredFiles, activeIdx, insertMention, closeMention, onCommit],
  );

  useEffect(() => {
    if (mentionQuery === null) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeMention();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mentionQuery, closeMention]);

  // Group for dropdown
  const grouped = filteredFiles.reduce<Record<string, WikiFile[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});
  let flatIdx = 0;

  return (
    <div ref={wrapRef} className="wikilist-wrap">
      {/* Existing items */}
      {items.length > 0 && (
        <div className="wikilist-items">
          {items.map((item, i) => (
            <div key={item.wikiPath || i} className="wikilist-item">
              <span className="wikilist-item-name">{item.name}</span>
              <span className="wikilist-item-path">{item.wikiPath}</span>
              <button
                type="button"
                className="wikilist-item-remove"
                onClick={() => removeItem(i)}
                title="Entfernen"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add input */}
      <div className="wikilist-add-row">
        <input
          ref={inputRef}
          className="wikilist-add-input"
          value={inputVal}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={() => { setTimeout(closeMention, 150); }}
          placeholder={items.length === 0 ? (field.placeholder ?? "@ für Wiki-Link…") : "@ weiteren hinzufügen…"}
        />
      </div>

      {/* Mirror for positioning (unused but kept for parity) */}
      <div ref={mirrorRef} aria-hidden className="wiki-mention-mirror" />

      {/* Dropdown */}
      {mentionQuery !== null && filteredFiles.length > 0 && (
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownTop, left: 0 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {Object.entries(grouped).map(([cat, files]) => (
            <div key={cat}>
              <div className="wiki-mention-group">{cat}</div>
              {files.map((file) => {
                const idx = flatIdx++;
                return (
                  <div
                    key={file.path}
                    className={`wiki-mention-item${idx === activeIdx ? " active" : ""}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={() => insertMention(file)}
                  >
                    {file.displayName}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {mentionQuery !== null && !cacheReady && _cacheLoading && (
        <div className="wiki-mention-dropdown" style={{ top: dropdownTop, left: 0 }}>
          <div className="wiki-mention-group">Lade...</div>
        </div>
      )}
    </div>
  );
}
