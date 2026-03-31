import { useState, useRef, useEffect, useCallback } from 'react';
import { wikiApi, shadowApi } from '../../api.ts';
import type { WikiType, WikiEntry } from '../../types.ts';

type MentionItem =
  | { kind: 'wiki'; typeId: string; typeName: string; entryId: string; displayName: string }
  | { kind: 'shadow'; path: string; displayName: string };

interface DropdownPos {
  top: number;
  left: number;
}

function shadowDisplayName(projectPath: string): string {
  const base = projectPath.includes('/') ? projectPath.slice(projectPath.lastIndexOf('/') + 1) : projectPath;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

// Module-level cache (wiki + shadow paths for @-mentions)
let _cache: MentionItem[] | null = null;
let _cacheLoading = false;
const _cacheListeners: Array<() => void> = [];

async function loadCache(excludeShadowPath: string | null): Promise<void> {
  if (_cache !== null) return;
  if (_cacheLoading) return;
  _cacheLoading = true;
  try {
    const items: MentionItem[] = [];

    try {
      const types: WikiType[] = await wikiApi.listTypes();
      await Promise.all(
        types.map(async (type) => {
          const entries: WikiEntry[] = await wikiApi.listEntries(type.id);
          for (const entry of entries) {
            const displayName = entry.values['name'] || entry.values['title'] || entry.id;
            items.push({
              kind: 'wiki',
              typeId: type.id,
              typeName: type.name,
              entryId: entry.id,
              displayName,
            });
          }
        }),
      );
    } catch {
      /* wiki unavailable */
    }

    try {
      const { paths } = await shadowApi.list();
      for (const p of paths) {
        if (excludeShadowPath != null && p === excludeShadowPath) continue;
        items.push({ kind: 'shadow', path: p, displayName: shadowDisplayName(p) });
      }
    } catch {
      /* shadow list unavailable */
    }

    _cache = items;
  } catch {
    _cache = [];
  } finally {
    _cacheLoading = false;
    const toRun = [..._cacheListeners];
    _cacheListeners.length = 0;
    toRun.forEach((fn) => fn());
  }
}

function invalidateCache() {
  _cache = null;
}

export interface ShadowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Project file path for the meta-note being edited; excluded from shadow @-mentions */
  excludeShadowPath?: string | null;
}

export function ShadowTextarea({
  value,
  onChange,
  onSave,
  placeholder,
  disabled,
  excludeShadowPath = null,
}: ShadowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0 });
  const [filteredItems, setFilteredItems] = useState<MentionItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cacheReady, setCacheReady] = useState(_cache !== null);

  const excludeRef = useRef(excludeShadowPath);
  excludeRef.current = excludeShadowPath;

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setFilteredItems([]);
    setActiveIdx(0);
  }, []);

  useEffect(() => {
    invalidateCache();
    setCacheReady(false);
    closeMention();
  }, [excludeShadowPath, closeMention]);

  const filterItems = useCallback((query: string) => {
    if (!_cache) return;
    const q = query.toLowerCase();
    const hits = _cache.filter((item) => {
      if (item.kind === 'wiki') {
        return (
          item.displayName.toLowerCase().includes(q) || item.typeName.toLowerCase().includes(q)
        );
      }
      return (
        item.displayName.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
      );
    });
    setFilteredItems(hits.slice(0, 12));
    setActiveIdx(0);
  }, []);

  useEffect(() => {
    if (cacheReady && mentionQuery !== null) {
      filterItems(mentionQuery);
    }
  }, [cacheReady, mentionQuery, filterItems]);

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
      mirror.style.width = ta.offsetWidth + 'px';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.wordBreak = 'break-word';

      const textBefore = value.slice(0, cursorPos);
      mirror.textContent = textBefore;

      const span = document.createElement('span');
      span.textContent = '|';
      mirror.appendChild(span);

      const wrapRect = wrap.getBoundingClientRect();
      const spanRect = span.getBoundingClientRect();

      const top = spanRect.bottom - wrapRect.top - ta.scrollTop + 4;
      const left = Math.max(0, spanRect.left - wrapRect.left);

      mirror.removeChild(span);

      setDropdownPos({ top, left });
    },
    [value],
  );

  const insertMention = useCallback(
    (item: MentionItem) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const before = value.slice(0, mentionStart);
      const after = value.slice(ta.selectionStart);
      const mention =
        item.kind === 'wiki'
          ? `@[${item.displayName}](${item.typeId}/${item.entryId})`
          : `@[${item.displayName}](shadow:${item.path})`;
      const newValue = before + mention + after;
      onChange(newValue);

      const newCursor = mentionStart + mention.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });

      closeMention();
    },
    [value, mentionStart, onChange, closeMention],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
        return;
      }
      if (mentionQuery !== null) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, filteredItems.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (filteredItems.length > 0) {
            e.preventDefault();
            insertMention(filteredItems[activeIdx]);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
        }
      }
    },
    [mentionQuery, filteredItems, activeIdx, insertMention, closeMention, onSave],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursor = e.target.selectionStart ?? 0;
      const textBeforeCursor = newValue.slice(0, cursor);
      const atIdx = textBeforeCursor.lastIndexOf('@');

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
      calcDropdownPos(cursor);

      if (_cache === null) {
        _cacheListeners.push(() => {
          setCacheReady(true);
        });
        void loadCache(excludeRef.current);
      } else {
        filterItems(fragment);
      }
    },
    [onChange, closeMention, calcDropdownPos, filterItems],
  );

  useEffect(() => {
    if (mentionQuery === null) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeMention();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionQuery, closeMention]);

  /** Group header key so row order matches filteredItems (keyboard nav). */
  function groupKey(item: MentionItem): string {
    return item.kind === 'wiki' ? `w:${item.typeId}` : 'shadow';
  }

  let prevGroup = '';
  return (
    <div ref={wrapRef} className="wiki-mention-wrap shadow-textarea-wrap">
      <textarea
        ref={textareaRef}
        className="shadow-panel-textarea"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />

      <div ref={mirrorRef} aria-hidden className="wiki-mention-mirror" />

      {mentionQuery !== null && filteredItems.length > 0 && (
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredItems.map((item, idx) => {
            const gk = groupKey(item);
            const showHeader = gk !== prevGroup;
            prevGroup = gk;
            const headerLabel = item.kind === 'wiki' ? item.typeName : 'Meta-Notizen';
            const rowKey =
              item.kind === 'wiki' ? `w:${item.typeId}/${item.entryId}` : `s:${item.path}`;
            return (
              <div key={rowKey}>
                {showHeader && <div className="wiki-mention-group">{headerLabel}</div>}
                <div
                  className={`wiki-mention-item${item.kind === 'shadow' ? ' wiki-mention-item--shadow' : ''}${idx === activeIdx ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={() => insertMention(item)}
                >
                  {item.kind === 'wiki' ? (
                    item.displayName
                  ) : (
                    <>
                      <span>{item.displayName}</span>
                      <span className="shadow-mention-path">{item.path}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mentionQuery !== null && !cacheReady && _cacheLoading && (
        <div className="wiki-mention-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
          <div className="wiki-mention-group">Laden…</div>
        </div>
      )}
    </div>
  );
}
