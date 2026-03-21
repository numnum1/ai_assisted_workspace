import { useState, useRef, useEffect, useCallback } from 'react';
import type { FieldRendererProps } from '../metaSchema.ts';
import { wikiApi } from '../../api.ts';
import type { WikiType, WikiEntry } from '../../types.ts';

interface MentionEntry {
  typeId: string;
  typeName: string;
  entryId: string;
  displayName: string;
}

interface DropdownPos {
  top: number;
  left: number;
}

// Module-level cache so entries survive re-renders and multiple fields
let _cache: MentionEntry[] | null = null;
let _cacheLoading = false;
const _cacheListeners: Array<() => void> = [];

async function loadCache(): Promise<void> {
  if (_cache !== null || _cacheLoading) return;
  _cacheLoading = true;
  try {
    const types: WikiType[] = await wikiApi.listTypes();
    const results: MentionEntry[] = [];
    await Promise.all(
      types.map(async (type) => {
        const entries: WikiEntry[] = await wikiApi.listEntries(type.id);
        for (const entry of entries) {
          const displayName =
            entry.values['name'] || entry.values['title'] || entry.id;
          results.push({
            typeId: type.id,
            typeName: type.name,
            entryId: entry.id,
            displayName,
          });
        }
      })
    );
    _cache = results;
    _cacheListeners.forEach(fn => fn());
    _cacheListeners.length = 0;
  } finally {
    _cacheLoading = false;
  }
}

function invalidateCache() {
  _cache = null;
}

export function wikiTextareaRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0 });
  const [filteredEntries, setFilteredEntries] = useState<MentionEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cacheReady, setCacheReady] = useState(_cache !== null);

  // Invalidate cache when field mounts (fresh data)
  useEffect(() => {
    invalidateCache();
    setCacheReady(false);
  }, []);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setFilteredEntries([]);
    setActiveIdx(0);
  }, []);

  const filterEntries = useCallback((query: string) => {
    if (!_cache) return;
    const q = query.toLowerCase();
    const hits = _cache.filter(
      e =>
        e.displayName.toLowerCase().includes(q) ||
        e.typeName.toLowerCase().includes(q)
    );
    setFilteredEntries(hits.slice(0, 12));
    setActiveIdx(0);
  }, []);

  // When cache loads, re-filter
  useEffect(() => {
    if (cacheReady && mentionQuery !== null) {
      filterEntries(mentionQuery);
    }
  }, [cacheReady, mentionQuery, filterEntries]);

  // Calculate dropdown position via mirror div
  const calcDropdownPos = useCallback((cursorPos: number) => {
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
  }, [value]);

  const insertMention = useCallback((entry: MentionEntry) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const before = value.slice(0, mentionStart);
    const after = value.slice(ta.selectionStart);
    const mention = `@[${entry.displayName}](${entry.typeId}/${entry.entryId})`;
    const newValue = before + mention + after;
    onChange(newValue);

    // Restore cursor after insertion
    const newCursor = mentionStart + mention.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });

    closeMention();
  }, [value, mentionStart, onChange, closeMention]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filteredEntries.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredEntries.length > 0) {
          e.preventDefault();
          insertMention(filteredEntries[activeIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
  }, [mentionQuery, filteredEntries, activeIdx, insertMention, closeMention]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursor = e.target.selectionStart ?? 0;
    // Find last @ before cursor that is not yet closed by a space or newline
    const textBeforeCursor = newValue.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf('@');

    if (atIdx === -1) {
      closeMention();
      return;
    }

    const fragment = textBeforeCursor.slice(atIdx + 1);
    // Close mention if there's a space or newline in the fragment (no spaces in queries)
    if (/[\s\n]/.test(fragment)) {
      closeMention();
      return;
    }

    // Activate mention mode
    setMentionStart(atIdx);
    setMentionQuery(fragment);
    calcDropdownPos(atIdx);

    if (_cache === null) {
      // Kick off load, re-filter when done
      _cacheListeners.push(() => {
        setCacheReady(true);
      });
      loadCache();
    } else {
      filterEntries(fragment);
    }
  }, [onChange, closeMention, calcDropdownPos, filterEntries]);

  // Close on outside click
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

  // Group filtered entries by type
  const grouped = filteredEntries.reduce<Record<string, { typeName: string; entries: MentionEntry[] }>>(
    (acc, entry) => {
      if (!acc[entry.typeId]) acc[entry.typeId] = { typeName: entry.typeName, entries: [] };
      acc[entry.typeId].entries.push(entry);
      return acc;
    },
    {}
  );

  // Flat list index → entry (for keyboard navigation)
  let flatIdx = 0;

  return (
    <div ref={wrapRef} className="wiki-mention-wrap">
      <textarea
        ref={textareaRef}
        className="meta-field-textarea"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
        placeholder={field.placeholder}
        rows={4}
      />

      {/* Hidden mirror for cursor position calculation */}
      <div
        ref={mirrorRef}
        aria-hidden
        className="wiki-mention-mirror"
      />

      {/* Mention dropdown */}
      {mentionQuery !== null && filteredEntries.length > 0 && (
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={e => e.preventDefault()}
        >
          {Object.values(grouped).map(group => (
            <div key={group.typeName}>
              <div className="wiki-mention-group">{group.typeName}</div>
              {group.entries.map(entry => {
                const idx = flatIdx++;
                return (
                  <div
                    key={entry.entryId}
                    className={`wiki-mention-item${idx === activeIdx ? ' active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={() => insertMention(entry)}
                  >
                    {entry.displayName}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Loading hint */}
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
