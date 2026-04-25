import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Search,
  GitBranch,
  MessageSquare,
  FolderCheck,
  GitCommit,
} from 'lucide-react';
import './ThreadBranchPicker.css';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ThreadBranchItem {
  id: string;
  title: string;
  messageCount?: number;
  /** Timestamp of the last activity — used for chronological ordering. */
  updatedAt?: number;
  /** Timestamp when the conversation was created — used as tie-breaker. */
  createdAt?: number;
  savedToProject?: boolean;
  /**
   * Full message list — used to render individual commits in the graph.
   * Only `user` messages are rendered as commits; others are skipped.
   */
  messages?: Array<{
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    hidden?: boolean;
  }>;
}

interface ThreadBranchPickerProps {
  main: ThreadBranchItem;
  threads: ThreadBranchItem[];
  activeId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible label for the trigger / listbox. */
  ariaLabel?: string;
  /** Show the git-graph visualisation (trunk + branch nodes). */
  showGraph?: boolean;
  /**
   * Render as an always-visible inline panel instead of a popup dropdown.
   * The trigger button is hidden; header, search and list fill the container.
   */
  panel?: boolean;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type InternalItem = ThreadBranchItem & {
  kind: 'main' | 'thread';
  isActive: boolean;
};

/** A single rendered row in the graph list. */
type GraphRow =
  | {
      rowKind: 'commit';
      branch: InternalItem;
      commitText: string;
      /** 1-based index within this branch's user messages. */
      commitIndex: number;
      /** True for the first row of this branch — badge is shown here. */
      isBranchFirst: boolean;
      isListFirst: boolean;
      isListLast: boolean;
    }
  | {
      rowKind: 'branch-head';
      branch: InternalItem;
      /** True when this branch has no commit rows (sole row for the branch). */
      isBranchFirst: boolean;
      isListFirst: boolean;
      isListLast: boolean;
    };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string in German.
 * Granularity: minutes → hours → days → date.
 */
function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);

  if (mins  <  1) return 'gerade eben';
  if (mins  < 60) return `vor ${mins} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days  ===1) return 'gestern';
  if (days  <  7) return `vor ${days} Tagen`;
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/** Truncates multi-line content to its first line, max 72 chars. */
function toCommitText(content: string): string {
  const first = content.trim().split('\n')[0] ?? '';
  return first.length > 72 ? first.slice(0, 70) + '…' : first;
}

/** Build a flat list of GraphRows from sorted branches. */
function buildGraphRows(items: InternalItem[]): GraphRow[] {
  const rows: GraphRow[] = [];

  for (const branch of items) {
    const commits = (branch.messages ?? [])
      .filter((m) => m.role === 'user' && !m.hidden)
      .slice(0, 50); // safety cap

    commits.forEach((msg, idx) => {
      rows.push({
        rowKind:      'commit',
        branch,
        commitText:   toCommitText(msg.content),
        commitIndex:  idx + 1,
        isBranchFirst: idx === 0,
        isListFirst:  false,
        isListLast:   false,
      });
    });

    // HEAD row — always present, sits below the commits (= newest = bottom)
    rows.push({
      rowKind:      'branch-head',
      branch,
      isBranchFirst: commits.length === 0,
      isListFirst:  false,
      isListLast:   false,
    });
  }

  if (rows.length > 0) {
    rows[0].isListFirst = true;
    rows[rows.length - 1].isListLast = true;
  }

  return rows;
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const rootRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId    = useId();

  const [open,          setOpen]          = useState(false);
  const [query,         setQuery]         = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  /**
   * Branches sorted chronologically: oldest `updatedAt` first (top of list).
   * This places the most recently active branch at the bottom so that a Main
   * chat continued after a Thread appears BELOW that Thread.
   */
  const allItems = useMemo<InternalItem[]>(() => {
    const items: InternalItem[] = [
      { ...main, kind: 'main',   isActive: main.id === activeId },
      ...threads.map((t) => ({
        ...t,
        kind: 'thread' as const,
        isActive: t.id === activeId,
      })),
    ];
    items.sort((a, b) => {
      const ua = a.updatedAt ?? a.createdAt ?? 0;
      const ub = b.updatedAt ?? b.createdAt ?? 0;
      return ua - ub;
    });
    return items;
  }, [main, threads, activeId]);

  const isFiltering = query.trim().length > 0;

  /** Branches filtered by title — used in search mode. */
  const filtered = useMemo<InternalItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => i.title.toLowerCase().includes(q));
  }, [allItems, query]);

  /**
   * Flat commit graph rows — used in normal (non-search) mode.
   * Re-computes only when allItems changes.
   */
  const graphRows = useMemo<GraphRow[]>(() => buildGraphRows(allItems), [allItems]);

  const totalCommits = useMemo(() =>
    allItems.reduce((n, item) =>
      n + (item.messages?.filter((m) => m.role === 'user' && !m.hidden).length ?? 0), 0),
    [allItems],
  );

  /** Length of the currently active list (rows or branches). */
  const activeListLen = isFiltering ? filtered.length : graphRows.length;

  // Reset keyboard highlight when filter / list length changes
  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, activeListLen - 1)));
  }, [activeListLen]);

  const activeItem = useMemo(
    () => allItems.find((i) => i.id === activeId) ?? main,
    [allItems, activeId, main],
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const pick = useCallback((id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  }, [onSelect]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    // Position cursor on the HEAD row of the active branch
    const headIdx = graphRows.findIndex(
      (r) => r.branch.id === activeId && r.rowKind === 'branch-head',
    );
    setSelectedIndex(headIdx >= 0 ? headIdx : 0);
  }, [disabled, graphRows, activeId]);

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
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, closeDropdown]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const maxIdx = Math.max(activeListLen - 1, 0);
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, maxIdx));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isFiltering && filtered.length > 0) {
          pick(filtered[selectedIndex]!.id);
        } else if (!isFiltering && graphRows.length > 0) {
          pick(graphRows[selectedIndex]!.branch.id);
        }
        break;
    }
  }, [activeListLen, closeDropdown, isFiltering, filtered, graphRows, selectedIndex, pick]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      handleKeyDown(e);
    }
  }, [handleKeyDown]);

  // ── Rendering helpers ──────────────────────────────────────────────────────

  const rootClass = [
    'tbp',
    showGraph && 'tbp--graph',
    panel      && 'tbp--panel',
    className,
  ].filter(Boolean).join(' ');

  /** Graph cell CSS class for a given row at position `idx` in the graphRows list. */
  const gcClass = (row: GraphRow, idx: number): string =>
    [
      'tbp__graph-cell',
      row.branch.kind === 'main'   ? 'tbp__graph-cell--main'   : 'tbp__graph-cell--thread',
      row.rowKind === 'commit'     && 'tbp__graph-cell--commit',
      row.rowKind === 'branch-head' && 'tbp__graph-cell--head',
      row.isListFirst              && 'tbp__graph-cell--first',
      row.isListLast               && 'tbp__graph-cell--last',
    ].filter(Boolean).join(' ');

  /** Option CSS class for a row at position `idx`. */
  const optClass = (row: GraphRow, idx: number): string =>
    [
      'tbp__option',
      row.rowKind === 'commit'      && 'tbp__option--commit',
      row.rowKind === 'branch-head' && 'tbp__option--head',
      row.branch.isActive           && 'tbp__option--active-branch',
      row.rowKind === 'branch-head' && row.branch.isActive && 'tbp__option--current',
      idx === selectedIndex         && 'tbp__option--keyboard',
      row.branch.kind === 'main' ? 'tbp__option--main' : 'tbp__option--thread',
    ].filter(Boolean).join(' ');

  // ── Branch-filter list (search mode) ──────────────────────────────────────

  const filterList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {filtered.length === 0 ? (
        <li className="tbp__empty" role="presentation">
          Kein passender Branch gefunden
        </li>
      ) : (
        filtered.map((item, i) => {
          const isMain   = item.kind === 'main';
          const msgLabel = item.messageCount !== undefined ? `${item.messageCount} Nachr.` : null;
          const timeLabel = item.updatedAt ? formatRelativeTime(item.updatedAt) : null;
          return (
            <li
              key={item.id}
              role="option"
              aria-selected={item.isActive}
              className={[
                'tbp__option tbp__option--head',
                i === selectedIndex && 'tbp__option--keyboard',
                item.isActive       && 'tbp__option--current',
                isMain ? 'tbp__option--main' : 'tbp__option--thread',
              ].filter(Boolean).join(' ')}
              onClick={() => pick(item.id)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="tbp__option-content">
                <div className="tbp__option-icon">
                  {isMain ? <MessageSquare size={14} /> : <GitBranch size={14} />}
                  {item.savedToProject && (
                    <FolderCheck size={11} className="tbp__saved-icon" title="Im Projekt gespeichert" />
                  )}
                </div>
                <div className="tbp__option-body">
                  <div className="tbp__option-label">
                    <span className={`tbp__kind-badge tbp__kind-badge--${isMain ? 'main' : 'thread'}`}>
                      {isMain ? 'main' : 'thread'}
                    </span>
                    <span className="tbp__option-title" title={item.title}>{item.title}</span>
                  </div>
                  {(msgLabel || timeLabel) && (
                    <div className="tbp__option-meta">
                      {msgLabel  && <span className="tbp__meta-chip">{msgLabel}</span>}
                      {msgLabel && timeLabel && <span className="tbp__meta-sep" aria-hidden>·</span>}
                      {timeLabel && <span className="tbp__meta-time">{timeLabel}</span>}
                    </div>
                  )}
                </div>
                {item.isActive && <Check size={14} className="tbp__option-check" aria-hidden />}
              </div>
            </li>
          );
        })
      )}
    </ul>
  );

  // ── Commit graph list (normal mode) ────────────────────────────────────────

  const commitList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {graphRows.length === 0 ? (
        <li className="tbp__empty" role="presentation">Keine Zweige vorhanden</li>
      ) : (
        graphRows.map((row, i) => {
          const isMain = row.branch.kind === 'main';
          const branchKindSlug = isMain ? 'main' : 'thread';
          const isHeadRow = row.rowKind === 'branch-head';

          if (isHeadRow) {
            const msgLabel  = row.branch.messageCount !== undefined
              ? `${row.branch.messageCount} Nachr.`
              : null;
            const timeLabel = row.branch.updatedAt
              ? formatRelativeTime(row.branch.updatedAt)
              : null;

            return (
              <li
                key={`${row.branch.id}::head`}
                role="option"
                aria-selected={row.branch.isActive}
                className={optClass(row, i)}
                onClick={() => pick(row.branch.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {showGraph && (
                  <div className={gcClass(row, i)} aria-hidden>
                    <div className="tbp__graph-node" />
                  </div>
                )}
                <div className="tbp__option-content">
                  <div className="tbp__option-icon">
                    {isMain ? <MessageSquare size={14} /> : <GitBranch size={14} />}
                    {row.branch.savedToProject && (
                      <FolderCheck size={11} className="tbp__saved-icon" title="Im Projekt gespeichert" />
                    )}
                  </div>
                  <div className="tbp__option-body">
                    <div className="tbp__option-label">
                      <span className={`tbp__kind-badge tbp__kind-badge--${branchKindSlug}`}>
                        {branchKindSlug}
                      </span>
                      <span className="tbp__option-title" title={row.branch.title}>
                        {row.branch.title}
                      </span>
                    </div>
                    {(msgLabel || timeLabel) && (
                      <div className="tbp__option-meta">
                        {msgLabel  && <span className="tbp__meta-chip">{msgLabel}</span>}
                        {msgLabel && timeLabel && <span className="tbp__meta-sep" aria-hidden>·</span>}
                        {timeLabel && <span className="tbp__meta-time">{timeLabel}</span>}
                      </div>
                    )}
                  </div>
                  {row.branch.isActive && (
                    <Check size={14} className="tbp__option-check" aria-hidden />
                  )}
                </div>
              </li>
            );
          }

          // Commit row
          return (
            <li
              key={`${row.branch.id}::commit::${row.commitIndex}`}
              role="option"
              aria-selected={false}
              className={optClass(row, i)}
              onClick={() => pick(row.branch.id)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {showGraph && (
                <div className={gcClass(row, i)} aria-hidden>
                  <div className="tbp__graph-node" />
                </div>
              )}
              <div className="tbp__option-content tbp__option-content--commit">
                {row.isBranchFirst && (
                  <span className={`tbp__kind-badge tbp__kind-badge--${branchKindSlug} tbp__kind-badge--sm`}>
                    {branchKindSlug}
                  </span>
                )}
                <GitCommit
                  size={11}
                  className="tbp__commit-icon"
                  aria-hidden
                />
                <span className="tbp__commit-index">#{row.commitIndex}</span>
                <span className="tbp__commit-text" title={row.commitText}>
                  {row.commitText}
                </span>
              </div>
            </li>
          );
        })
      )}
    </ul>
  );

  // ── Shared chrome (header + search + footer) ───────────────────────────────

  const listContent = (
    <>
      <div className="tbp__header">
        <GitBranch size={14} className="tbp__header-icon" aria-hidden />
        <span className="tbp__header-title">Commit-Graph</span>
        <div className="tbp__header-badges">
          <span className="tbp__badge tbp__badge--main" title="Haupt-Chat">1 Main</span>
          {threads.length > 0 && (
            <span className="tbp__badge tbp__badge--thread" title="Threads">
              {threads.length}&thinsp;Thread{threads.length !== 1 ? 's' : ''}
            </span>
          )}
          {totalCommits > 0 && (
            <span className="tbp__badge tbp__badge--commits" title="User-Nachrichten (Commits)">
              {totalCommits}&thinsp;Commits
            </span>
          )}
        </div>
      </div>

      <div className="tbp__search-row">
        <Search size={13} className="tbp__search-icon" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          className="tbp__search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Branch suchen…"
          aria-label="Branches filtern"
          autoComplete="off"
        />
      </div>

      {isFiltering ? filterList : commitList}

      <div className="tbp__footer">
        <span className="tbp__hint">
          ↑↓ navigieren · Enter wechseln · Esc schließen
        </span>
      </div>
    </>
  );

  // ── Panel mode ─────────────────────────────────────────────────────────────

  if (panel) {
    return (
      <div ref={rootRef} className={rootClass} onKeyDown={handleKeyDown}>
        {listContent}
      </div>
    );
  }

  // ── Dropdown mode ──────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        type="button"
        className="tbp__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => { if (open) closeDropdown(); else openDropdown(); }}
      >
        <GitBranch size={14} className="tbp__trigger-icon" aria-hidden />
        <span className="tbp__trigger-label" title={activeItem.title}>
          {activeItem.title}
        </span>
        <ChevronDown
          size={12}
          className={`tbp__trigger-chevron${open ? ' tbp__trigger-chevron--open' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="tbp__dropdown" onKeyDown={handleKeyDown}>
          {listContent}
        </div>
      )}
    </div>
  );
}

/**
 * Git-inspired Thread / Branch Picker with per-message Commit Graph
 *
 * Key behaviours:
 * - Branches sorted chronologically (oldest `updatedAt` at top → newest at bottom).
 * - Each user message is a "commit" row in the graph; the branch HEAD row sits below.
 * - Trunk lane (blue, left) for Main; branch lane (green, right + arm) for Threads.
 * - Graph hidden while search is active (topology doesn't apply to filtered results).
 * - Works in "dropdown" (default) or "panel" (always-visible, fills container) mode.
 */
