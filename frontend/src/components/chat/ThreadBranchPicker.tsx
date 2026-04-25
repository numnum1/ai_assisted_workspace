import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, GitBranch, MessageSquare, FolderCheck } from 'lucide-react';

export interface ThreadBranchItem {
  id: string;
  title: string;
  messageCount?: number;
  updatedAt?: number;
  savedToProject?: boolean;
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
  /** Show git-graph style visualization */
  showGraph?: boolean;
  /**
   * Render as an always-visible inline panel instead of a dropdown.
   * The trigger button is hidden; header, search and list fill the container.
   */
  panel?: boolean;
}

type InternalItem = ThreadBranchItem & { kind: 'main' | 'thread'; isActive: boolean };

export function ThreadBranchPicker({
  main,
  threads,
  activeId,
  onSelect,
  disabled = false,
  className = '',
  ariaLabel = 'Chat-Zweig wechseln',
  showGraph = true,
  panel = false,
}: ThreadBranchPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allItems: InternalItem[] = useMemo(() => {
    const mainItem: InternalItem = { ...main, kind: 'main', isActive: main.id === activeId };
    const threadItems: InternalItem[] = threads.map((t) => ({
      ...t,
      kind: 'thread' as const,
      isActive: t.id === activeId,
    }));
    return [mainItem, ...threadItems];
  }, [main, threads, activeId]);

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

  const formatMeta = useCallback((item: InternalItem): string => {
    const parts: string[] = [];
    if (item.messageCount !== undefined) {
      parts.push(`${item.messageCount} Nachr.`);
    }
    if (item.updatedAt) {
      const date = new Date(item.updatedAt);
      const now = Date.now();
      const diffMs = now - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) parts.push('heute');
      else if (diffDays === 1) parts.push('gestern');
      else if (diffDays < 7) parts.push(`vor ${diffDays} Tagen`);
      else parts.push(date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    }
    return parts.join(' · ');
  }, []);

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

  const rootClass = [
    'thread-branch-picker',
    showGraph && 'thread-branch-picker--graph',
    panel && 'thread-branch-picker--panel',
    className
  ].filter(Boolean).join(' ');

  /** Shared list content used in both dropdown and panel mode. */
  const listContent = (
    <>
      <div className="thread-branch-picker__header">
        <GitBranch size={18} />
        <span>Git Branch Graph</span>
        <div className="thread-branch-picker__header-meta">
          {threads.length + 1} Zweige
        </div>
      </div>

      <div className="thread-branch-picker__search-row">
        <Search size={14} className="thread-branch-picker__search-icon" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          className="thread-branch-picker__search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Branches / Threads durchsuchen…"
          aria-label="Threads filtern"
          autoComplete="off"
        />
      </div>

      <ul id={listId} className="thread-branch-picker__list" role="listbox" aria-label={ariaLabel}>
        {filtered.length === 0 ? (
          <li className="thread-branch-picker__empty" role="presentation">
            Keine passenden Branches gefunden
          </li>
        ) : (
          filtered.map((item, i) => {
            const isMain = item.kind === 'main';
            const meta = formatMeta(item);
            return (
              <li
                key={item.id}
                role="option"
                aria-selected={item.isActive}
                className={`thread-branch-picker__option thread-branch-picker__option--graph
                  ${i === selectedIndex ? 'thread-branch-picker__option--keyboard' : ''}
                  ${item.isActive ? 'thread-branch-picker__option--current' : ''}
                  ${isMain ? 'thread-branch-picker__option--main' : ''}`}
                onClick={() => pick(item.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {/* Git graph line */}
                <div className="thread-branch-picker__graph-line">
                  <div className={`thread-branch-picker__graph-node ${isMain ? 'main' : 'branch'}`} />
                  {!isMain && <div className="thread-branch-picker__graph-connector" />}
                </div>

                <div className="thread-branch-picker__option-content">
                  <div className="thread-branch-picker__option-icon">
                    {isMain ? (
                      <MessageSquare size={16} />
                    ) : (
                      <GitBranch size={16} />
                    )}
                    {item.savedToProject && (
                      <FolderCheck size={12} className="thread-branch-picker__saved-icon" />
                    )}
                  </div>

                  <div className="thread-branch-picker__option-main">
                    <div className="thread-branch-picker__option-title" title={item.title}>
                      {item.title}
                    </div>
                    {meta && (
                      <div className="thread-branch-picker__option-meta">
                        {meta}
                      </div>
                    )}
                  </div>

                  {item.isActive && (
                    <Check size={18} className="thread-branch-picker__option-check" aria-hidden />
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="thread-branch-picker__footer">
        <span className="thread-branch-picker__hint">
          ←↑↓→ zum Navigieren • Enter zum Wechseln • ESC zum Schließen
        </span>
      </div>
    </>
  );

  if (panel) {
    return (
      <div
        ref={rootRef}
        className={rootClass}
        onKeyDown={handleKeyDownOnDropdown}
      >
        {listContent}
      </div>
    );
  }

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
        <GitBranch size={16} className="thread-branch-picker__git-icon" aria-hidden />
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
          {listContent}
        </div>
      )}
    </div>
  );
}

/**
 * Git-inspired Thread/Branch Picker
 *
 * Supports rich Conversation data:
 * - Visual branch graph with connecting lines
 * - Message count, relative timestamps
 * - savedToProject indicator (FolderCheck)
 * - Keyboard navigation + search
 *
 * Example:
 *
 * ```tsx
 * <ThreadBranchPicker
 *   main={{
 *     id: 'root-1',
 *     title: 'Haupt-Chat: Kapitel 3 Überarbeitung',
 *     messageCount: 24,
 *     updatedAt: Date.now() - 3600000,
 *     savedToProject: true
 *   }}
 *   threads={[
 *     { id: 't1', title: 'UI-Feedback Runde 2', messageCount: 12, updatedAt: Date.now() - 86400000 },
 *     { id: 't2', title: 'Refactoring der API', messageCount: 8, updatedAt: Date.now() - 7200000, savedToProject: true },
 *   ]}
 *   activeId="t1"
 *   onSelect={(id) => console.log('Switch to branch:', id)}
 *   showGraph={true}
 * />
 * ```
 */
