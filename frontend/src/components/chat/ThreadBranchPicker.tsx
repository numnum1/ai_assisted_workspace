import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface ThreadBranchItem {
  id: string;
  title: string;
}

interface ThreadBranchPickerProps {
  main: ThreadBranchItem;
  threads: ThreadBranchItem[];
  activeId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible label for the trigger (e.g. "Chat-Zweig wechseln"). */
  ariaLabel?: string;
}

type InternalItem = ThreadBranchItem & { kind: 'main' | 'thread' };

export function ThreadBranchPicker({
  main,
  threads,
  activeId,
  onSelect,
  disabled = false,
  className = '',
  ariaLabel = 'Chat-Zweig wählen',
}: ThreadBranchPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allItems: InternalItem[] = useMemo(
    () => [{ ...main, kind: 'main' }, ...threads.map((t) => ({ ...t, kind: 'thread' as const }))],
    [main, threads],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => i.title.toLowerCase().includes(q));
  }, [allItems, query]);

  /** Reset keyboard highlight when the filter text changes (not when only opening/closing). */
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const activeItem = useMemo(
    () => allItems.find((i) => i.id === activeId) ?? main,
    [allItems, activeId, main],
  );

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const idx = allItems.findIndex((i) => i.id === activeId);
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [disabled, allItems, activeId]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, closeDropdown]);

  const pick = useCallback(
    (id: string) => {
      onSelect(id);
      closeDropdown();
    },
    [onSelect, closeDropdown],
  );

  const handleTriggerClick = () => {
    if (disabled) return;
    if (open) closeDropdown();
    else openDropdown();
  };

  const handleKeyDownOnDropdown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      pick(filtered[selectedIndex]!.id);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      handleKeyDownOnDropdown(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  };

  const rootClass = ['thread-branch-picker', className].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        type="button"
        className="thread-branch-picker__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={handleTriggerClick}
      >
        <span className="thread-branch-picker__trigger-label" title={activeItem.title}>
          {activeItem.title}
        </span>
        <ChevronDown
          size={14}
          className={`thread-branch-picker__trigger-chevron${open ? ' thread-branch-picker__trigger-chevron--open' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="thread-branch-picker__dropdown"
          onKeyDown={handleKeyDownOnDropdown}
        >
          <div className="thread-branch-picker__search-row">
            <Search size={14} className="thread-branch-picker__search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="thread-branch-picker__search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Threads durchsuchen…"
              aria-label="Threads filtern"
              autoComplete="off"
            />
          </div>
          <ul id={listId} className="thread-branch-picker__list" role="listbox" aria-label={ariaLabel}>
            {filtered.length === 0 ? (
              <li className="thread-branch-picker__empty" role="presentation">
                Keine Treffer
              </li>
            ) : (
              filtered.map((item, i) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={item.id === activeId}
                  className={`thread-branch-picker__option${i === selectedIndex ? ' thread-branch-picker__option--keyboard' : ''}${item.id === activeId ? ' thread-branch-picker__option--current' : ''}`}
                  onClick={() => pick(item.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="thread-branch-picker__option-meta">
                    {item.kind === 'main' ? 'Haupt-Chat' : 'Thread'}
                  </span>
                  <span className="thread-branch-picker__option-title" title={item.title}>
                    {item.title}
                  </span>
                  {item.id === activeId && (
                    <Check size={14} className="thread-branch-picker__option-check" aria-hidden />
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Beispiel für spätere Einbindung (kein Runtime-Demo):
 *
 * ```tsx
 * <ThreadBranchPicker
 *   main={{ id: 'root-1', title: 'Projekt-Chat' }}
 *   threads={[
 *     { id: 't1', title: 'Refactor API' },
 *     { id: 't2', title: 'UI-Feedback' },
 *   ]}
 *   activeId="t1"
 *   onSelect={(id) => console.log(id)}
 * />
 * ```
 */
