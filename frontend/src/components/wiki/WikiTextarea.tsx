import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { wikiApi } from "../../api.ts";

function renderMentionPreview(value: string, placeholder?: string): ReactNode {
  if (!value)
    return (
      <span className="wiki-mention-preview-placeholder">
        {placeholder ?? ""}
      </span>
    );
  const re = /@\[([^\]]+)\]\([^)]+\)/g;
  const parts: ReactNode[] = [];
  let last = 0,
    key = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last)
      parts.push(<span key={key++}>{value.slice(last, m.index)}</span>);
    parts.push(
      <span key={key++} className="wiki-mention-token">
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < value.length)
    parts.push(<span key={key++}>{value.slice(last)}</span>);
  return parts;
}

interface WikiFile {
  path: string;
  displayName: string;
  category: string;
}

interface DropdownPos {
  top: number;
  left: number;
}

// Module-level cache for wiki files
let _cache: WikiFile[] | null = null;
let _cacheLoading = false;
const _cacheListeners: Array<() => void> = [];

function fileDisplayName(path: string): string {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
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

export function invalidateWikiCache() {
  _cache = null;
}

export interface WikiTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function WikiTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  rows = 4,
  autoFocus,
  onKeyDown: externalKeyDown,
  textareaRef: externalRef,
}: WikiTextareaProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState(false);
  const [customHeight, setCustomHeight] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (editing && textareaRef.current) {
      if (customHeight !== undefined) {
        textareaRef.current.style.height = `${customHeight}px`;
      }
      textareaRef.current.focus();
    }
  }, [editing, textareaRef, customHeight]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!editing || !ta) return;
    const observer = new ResizeObserver(() => {
      setCustomHeight(ta.offsetHeight);
    });
    observer.observe(ta);
    return () => observer.disconnect();
  }, [editing, textareaRef]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({
    top: 0,
    left: 0,
  });
  const [filteredFiles, setFilteredFiles] = useState<WikiFile[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cacheReady, setCacheReady] = useState(_cache !== null);

  useEffect(() => {
    invalidateWikiCache();
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
    if (cacheReady && mentionQuery !== null) {
      filterFiles(mentionQuery);
    }
  }, [cacheReady, mentionQuery, filterFiles]);

  const calcDropdownPos = useCallback(
    (cursorPos: number) => {
      const ta = textareaRef.current;
      const mirror = mirrorRef.current;
      const wrap = wrapRef.current;
      if (!ta || !mirror || !wrap) return;

      const style = window.getComputedStyle(ta);
      mirror.style.font = style.font;
      mirror.style.fontSize = style.fontSize;
      mirror.style.fontFamily = style.fontFamily;
      mirror.style.lineHeight = style.lineHeight;
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.style.padding = style.padding;
      mirror.style.width = ta.offsetWidth + "px";
      mirror.style.whiteSpace = "pre-wrap";
      mirror.style.wordBreak = "break-word";

      const textBefore = value.slice(0, cursorPos);
      mirror.textContent = textBefore;

      const span = document.createElement("span");
      span.textContent = "|";
      mirror.appendChild(span);

      const wrapRect = wrap.getBoundingClientRect();
      const spanRect = span.getBoundingClientRect();

      const top = spanRect.bottom - wrapRect.top - ta.scrollTop + 4;
      const left = Math.max(0, spanRect.left - wrapRect.left);

      mirror.removeChild(span);
      setDropdownPos({ top, left });
    },
    [value, textareaRef],
  );

  const insertMention = useCallback(
    (file: WikiFile) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const before = value.slice(0, mentionStart);
      const after = value.slice(ta.selectionStart);
      const mention = `@[${file.displayName}](wiki/${file.path})`;
      const newValue = before + mention + after;
      onChange(newValue);

      const newCursor = mentionStart + mention.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });

      closeMention();
    },
    [value, mentionStart, onChange, closeMention, textareaRef],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, filteredFiles.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          if (filteredFiles.length > 0) {
            e.preventDefault();
            insertMention(filteredFiles[activeIdx]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeMention();
          return;
        }
      }
      externalKeyDown?.(e);
    },
    [
      mentionQuery,
      filteredFiles,
      activeIdx,
      insertMention,
      closeMention,
      externalKeyDown,
    ],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursor = e.target.selectionStart ?? 0;
      const textBeforeCursor = newValue.slice(0, cursor);
      const atIdx = textBeforeCursor.lastIndexOf("@");

      if (atIdx === -1) {
        closeMention();
        return;
      }

      const fragment = textBeforeCursor.slice(atIdx + 1);
      if (/[\s\n]/.test(fragment)) {
        closeMention();
        return;
      }

      setMentionStart(atIdx);
      setMentionQuery(fragment);
      calcDropdownPos(atIdx);

      if (_cache === null) {
        _cacheListeners.push(() => {
          setCacheReady(true);
        });
        loadCache();
      } else {
        filterFiles(fragment);
      }
    },
    [onChange, closeMention, calcDropdownPos, filterFiles],
  );

  useEffect(() => {
    if (mentionQuery === null) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeMention();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mentionQuery, closeMention]);

  const grouped = filteredFiles.reduce<Record<string, WikiFile[]>>(
    (acc, file) => {
      const cat = file.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(file);
      return acc;
    },
    {},
  );

  let flatIdx = 0;

  return (
    <div ref={wrapRef} className="wiki-mention-wrap">
      {editing ? (
        <textarea
          ref={textareaRef}
          className={className ?? "meta-field-textarea"}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            onCommit?.();
            setEditing(false);
          }}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          style={
            customHeight !== undefined ? { height: customHeight } : undefined
          }
        />
      ) : (
        <div
          className={`wiki-mention-preview ${className ?? "meta-field-textarea"}`}
          style={
            {
              "--preview-rows": rows,
              ...(customHeight !== undefined ? { height: customHeight } : {}),
            } as React.CSSProperties
          }
          onClick={() => setEditing(true)}
        >
          {renderMentionPreview(value, placeholder)}
        </div>
      )}

      <div ref={mirrorRef} aria-hidden className="wiki-mention-mirror" />

      {mentionQuery !== null && filteredFiles.length > 0 && (
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
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
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="wiki-mention-group">Lade...</div>
        </div>
      )}
    </div>
  );
}
