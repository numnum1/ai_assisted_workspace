import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Search,
  GitBranch,
  GitMerge,
  MessageSquare,
  FolderCheck,
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
  /** True when this thread has been summarised and merged into the parent chat. */
  mergedToParent?: boolean;
  /**
   * Full message list — each user message becomes a "commit" node in the graph.
   * Tool, assistant, and system messages are skipped.
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
  /** Show the git-graph visualisation. */
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
  /** Lane index — main = 0, thread 1 = 1, thread 2 = 2, … */
  lane: number;
};

/**
 * A single rendered row in the commit graph.
 *
 * Rows come in three kinds:
 *  - commit/fork-start  — first user message of a thread (fork connector drawn)
 *  - commit/fork-end    — last user message of a thread
 *  - merge              — thread was merged back into the main branch
 *  - branch-head        — clickable HEAD node for a branch
 */
interface GraphRow {
  rowKind: 'commit' | 'branch-head' | 'merge';
  branch: InternalItem;
  /** Lane this row's node belongs to. */
  lane: number;
  /**
   * All lane indices that need a vertical line through this row.
   * Populated by buildGraphRows phase 4.
   */
  activeLanes: number[];
  /** First user message of a thread — fork connector is drawn here. */
  isForkStart: boolean;
  /** Last user message of a thread — marks the branch tip before the HEAD row. */
  isForkEnd: boolean;
  isListFirst: boolean;
  isListLast: boolean;
  /** Only for 'commit' rows. */
  commitText?: string;
  commitIndex?: number;
  /** True on the first commit row of a branch — kind badge rendered here. */
  isBranchFirst?: boolean;
  /** For 'merge' rows: the lane of the thread being merged. */
  mergeLane?: number;
}

// ─── Graph constants ──────────────────────────────────────────────────────────

/** Horizontal pixels per lane. */
const LANE_W = 14;
/** ViewBox height (px). The SVG scales vertically via preserveAspectRatio="none". */
const ROW_H = 28;
/** Horizontal centre of lane `l` in the SVG coordinate system. */
const laneX = (l: number): number => l * LANE_W + 8;

/** Per-lane colour palette. Lane 0 = main (blue), subsequent = thread colours. */
const LANE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
const laneColor = (l: number): string => LANE_COLORS[l % LANE_COLORS.length] ?? '#3b82f6';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function toCommitText(content: string): string {
  const first = content.trim().split('\n')[0] ?? '';
  return first.length > 72 ? first.slice(0, 70) + '…' : first;
}

function getUserCommits(item: InternalItem): string[] {
  return (item.messages ?? [])
    .filter((m) => m.role === 'user' && !m.hidden)
    .slice(0, 50)
    .map((m) => toCommitText(m.content));
}

/**
 * Builds the flat list of GraphRows for the sparse multi-lane commit graph.
 *
 * Instead of rendering every user message as a node, only three topologically
 * significant row types are emitted:
 *
 *   fork-start  — first user message of a thread (where the branch diverges)
 *   fork-end    — last user message of a thread (the current branch tip)
 *   branch-head — clickable HEAD node for every branch (main + threads)
 *
 * This keeps the graph readable even for very long conversations.
 *
 * The main lane (0) has no commit rows of its own — it runs as a continuous
 * vertical line through all thread rows and terminates at its HEAD node.
 *
 * Returns `firstRowIdx` and `lastRowIdx` per lane so GraphSvg can clip
 * vertical lines correctly (threads start at their fork node, all lanes
 * end at their HEAD node).
 */
function buildGraphRows(allItems: InternalItem[]): {
  rows: GraphRow[];
  numLanes: number;
  firstRowIdx: number[];
  lastRowIdx: number[];
} {
  const numLanes    = allItems.length;
  const commitCache = allItems.map(getUserCommits);
  const rows: GraphRow[] = [];

  // ── Phase 1: fork-start + fork-end rows for each thread ──────────────────
  // Only threads (not main) get commit rows. Two rows per thread, always.
  const threadItems = allItems.filter((item) => item.kind === 'thread');
  for (const item of threadItems) {
    const commits = commitCache[item.lane];
    if (commits.length === 0) continue; // no messages → only branch-head row

    rows.push({
      rowKind:      'commit',
      branch:       item,
      lane:         item.lane,
      activeLanes:  [],
      isForkStart:  true,
      isForkEnd:    false,
      isListFirst:  false,
      isListLast:   false,
      commitText:   commits[0],
      commitIndex:  1,
      isBranchFirst: true,
    });

    rows.push({
      rowKind:      'commit',
      branch:       item,
      lane:         item.lane,
      activeLanes:  [],
      isForkStart:  false,
      isForkEnd:    true,
      isListFirst:  false,
      isListLast:   false,
      commitText:   commits[commits.length - 1],
      commitIndex:  commits.length,
      isBranchFirst: false,
    });
  }

  // ── Phase 1.5: merge rows for threads that have been merged to parent ────────
  // One row per merged thread, placed on the main lane (0) with a connector
  // drawn from the thread lane back to main.
  for (const item of threadItems) {
    if (!item.mergedToParent) continue;
    rows.push({
      rowKind:      'merge',
      branch:       item,
      lane:         0,
      activeLanes:  [],
      isForkStart:  false,
      isForkEnd:    false,
      isListFirst:  false,
      isListLast:   false,
      mergeLane:    item.lane,
    });
  }

  // ── Phase 2: branch-head rows (one per branch, main first then threads) ───
  for (const item of allItems) {
    rows.push({
      rowKind:      'branch-head',
      branch:       item,
      lane:         item.lane,
      activeLanes:  [],
      isForkStart:  false,
      isForkEnd:    false,
      isListFirst:  false,
      isListLast:   false,
      isBranchFirst: item.kind === 'main' || commitCache[item.lane].length === 0,
    });
  }

  if (rows.length === 0) {
    return { rows, numLanes, firstRowIdx: [], lastRowIdx: [] };
  }

  // ── Phase 3: firstRowIdx / lastRowIdx per lane ────────────────────────────
  // Main lane (0) is forced to start at row 0 so its line runs from the top
  // even when the first visible rows belong to thread branches.
  const firstRowIdx: number[] = new Array(numLanes).fill(-1);
  const lastRowIdx:  number[] = new Array(numLanes).fill(-1);
  firstRowIdx[0] = 0;

  rows.forEach((r, i) => {
    const l = r.lane;
    if (firstRowIdx[l] === -1) firstRowIdx[l] = i;
    lastRowIdx[l] = i;
  });

  // ── Phase 4: activeLanes for every row ────────────────────────────────────
  rows.forEach((r, i) => {
    r.activeLanes = [];
    for (let l = 0; l < numLanes; l++) {
      if (firstRowIdx[l] !== -1 && firstRowIdx[l] <= i && i <= lastRowIdx[l]) {
        r.activeLanes.push(l);
      }
    }
  });

  // ── Phase 5: list boundary flags ─────────────────────────────────────────
  rows[0].isListFirst = true;
  rows[rows.length - 1].isListLast = true;

  return { rows, numLanes, firstRowIdx, lastRowIdx };
}

// ─── SVG graph cell ───────────────────────────────────────────────────────────

interface GraphSvgProps {
  row: GraphRow;
  rowIndex: number;
  numLanes: number;
  firstRowIdx: number[];
  lastRowIdx: number[];
}

function GraphSvg({ row, rowIndex, numLanes, firstRowIdx, lastRowIdx }: GraphSvgProps) {
  const svgW  = numLanes * LANE_W + 8;
  const cx    = laneX(row.lane);
  const cy    = ROW_H / 2;
  const mainX = laneX(0);
  const nodeR = row.rowKind === 'branch-head' ? 5 : row.rowKind === 'merge' ? 4 : 3;
  // For merge rows use the thread's colour so the connector visually links to its branch.
  const color = (row.rowKind === 'merge' && row.mergeLane !== undefined)
    ? laneColor(row.mergeLane)
    : laneColor(row.lane);

  return (
    <svg
      width={svgW}
      height="100%"
      viewBox={`0 0 ${svgW} ${ROW_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className="tbp__graph-svg"
    >
      {/* 1. Vertical line segments for every active lane */}
      {row.activeLanes.map((l) => {
        const x             = laneX(l);
        const isFirstForLane = rowIndex === firstRowIdx[l];
        const isLastForLane  = rowIndex === lastRowIdx[l];
        // Thread lane on its own fork-start row: line begins AT the node going down.
        // (The fork connector arrives from above; we don't need a line above the node.)
        const y1 = (isFirstForLane && l === row.lane && row.isForkStart) ? cy : 0;
        // All lanes terminate their line at the node on their final (HEAD) row.
        const y2 = isLastForLane ? cy : ROW_H;
        if (y1 >= y2) return null;
        return (
          <line
            key={l}
            x1={x} y1={y1}
            x2={x} y2={y2}
            stroke={laneColor(l)}
            strokeWidth={2}
            opacity={0.35}
          />
        );
      })}

      {/* 2. Fork connector: horizontal branch from main lane to thread lane.
              Drawn on the fork-start row of each thread.
              Shape: from (mainX, cy) going right to just before (cx, cy),
              then a small rounded corner turns downward.
              The thread lane's own vertical line takes over from cy downward. */}
      {row.isForkStart && cx > mainX && (
        <path
          d={`M ${mainX},${cy} L ${cx - 4},${cy} Q ${cx},${cy} ${cx},${cy + 4}`}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* 2b. Merge connector: curve from the thread lane down to the main lane.
               Drawn on merge rows. Shape: starts at the thread lane at the top of
               the row, curves inward and lands on the main lane at mid-height. */}
      {row.rowKind === 'merge' && row.mergeLane !== undefined && row.mergeLane > 0 && (
        <path
          d={`M ${laneX(row.mergeLane)},0 Q ${laneX(row.mergeLane)},${cy} ${mainX},${cy}`}
          stroke={laneColor(row.mergeLane)}
          strokeWidth={2}
          fill="none"
          opacity={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* 3. Commit / HEAD / merge node */}
      <circle
        cx={cx}
        cy={cy}
        r={nodeR}
        fill={color}
        stroke="var(--bg-primary, #1e1e2e)"
        strokeWidth={row.rowKind === 'branch-head' ? 2 : 1.5}
        opacity={row.rowKind === 'branch-head' ? 1 : 0.85}
      />

      {/* 4. Extra ring on the active branch's HEAD node */}
      {row.rowKind === 'branch-head' && row.branch.isActive && (
        <circle
          cx={cx}
          cy={cy}
          r={nodeR + 3}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.4}
        />
      )}
    </svg>
  );
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
   * Branches with lane assignments.
   * Main is always lane 0. Threads get lanes 1, 2, … in the order they were
   * created (sorted by createdAt / updatedAt ascending).
   *
   * The list is sorted by updatedAt ascending so the most recently active
   * branch appears at the bottom — matching the git convention that HEAD is
   * "furthest along the timeline".
   */
  const allItems = useMemo<InternalItem[]>(() => {
    const mainItem: InternalItem = {
      ...main,
      kind: 'main',
      isActive: main.id === activeId,
      lane: 0,
    };
    // Sort threads by createdAt ascending to assign stable lane numbers
    const sortedThreads = [...threads].sort((a, b) =>
      (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0),
    );
    const threadItems: InternalItem[] = sortedThreads.map((t, idx) => ({
      ...t,
      kind:     'thread' as const,
      isActive: t.id === activeId,
      lane:     idx + 1,
    }));
    return [mainItem, ...threadItems];
  }, [main, threads, activeId]);

  const isFiltering = query.trim().length > 0;

  /** Branch list filtered by title — used in search mode (1 row per branch). */
  const filtered = useMemo<InternalItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => i.title.toLowerCase().includes(q));
  }, [allItems, query]);

  /** Full commit graph — rebuilt only when allItems changes. */
  const { rows: graphRows, numLanes, firstRowIdx, lastRowIdx } = useMemo(
    () => buildGraphRows(allItems),
    [allItems],
  );

  const totalCommits = useMemo(() =>
    allItems.reduce((n, item) =>
      n + (item.messages?.filter((m) => m.role === 'user' && !m.hidden).length ?? 0), 0),
    [allItems],
  );

  const activeListLen = isFiltering ? filtered.length : graphRows.length;

  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, activeListLen - 1)));
  }, [activeListLen]);

  const activeItem = useMemo(
    () => allItems.find((i) => i.id === activeId) ?? main,
    [allItems, activeId, main],
  ) as InternalItem;

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

  // ── CSS helpers ────────────────────────────────────────────────────────────

  const rootClass = [
    'tbp',
    showGraph && 'tbp--graph',
    panel      && 'tbp--panel',
    className,
  ].filter(Boolean).join(' ');

  const optClass = (row: GraphRow, idx: number): string =>
    [
      'tbp__option',
      row.rowKind === 'commit'       && 'tbp__option--commit',
      row.rowKind === 'branch-head'  && 'tbp__option--head',
      row.rowKind === 'merge'        && 'tbp__option--merge',
      row.branch.isActive            && 'tbp__option--active-branch',
      row.rowKind === 'branch-head'  && row.branch.isActive && 'tbp__option--current',
      idx === selectedIndex          && 'tbp__option--keyboard',
      row.branch.kind === 'main' ? 'tbp__option--main' : 'tbp__option--thread',
    ].filter(Boolean).join(' ');

  // ── Search / filter list (1 row per branch) ────────────────────────────────

  const filterList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {filtered.length === 0 ? (
        <li className="tbp__empty" role="presentation">Kein passender Branch gefunden</li>
      ) : (
        filtered.map((item, i) => {
          const isMain    = item.kind === 'main';
          const msgLabel  = item.messageCount !== undefined ? `${item.messageCount} Nachr.` : null;
          const timeLabel = item.updatedAt ? formatRelativeTime(item.updatedAt) : null;
          const color     = laneColor(item.lane);
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
                <div className="tbp__option-icon" style={{ color }}>
                  {isMain ? <MessageSquare size={14} /> : <GitBranch size={14} />}
                  {item.savedToProject && (
                    <FolderCheck size={11} className="tbp__saved-icon" title="Im Projekt gespeichert" />
                  )}
                </div>
                <div className="tbp__option-body">
                  <div className="tbp__option-label">
                    <span
                      className="tbp__kind-badge"
                      style={{ background: `${color}22`, color }}
                    >
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
          const isMain        = row.branch.kind === 'main';
          const color         = laneColor(row.lane);
          const isHeadRow     = row.rowKind === 'branch-head';

          // Merge row: thread was summarised and merged back into the main branch
          if (row.rowKind === 'merge') {
            const mergeColor = row.mergeLane !== undefined ? laneColor(row.mergeLane) : color;
            return (
              <li
                key={`${row.branch.id}::merge`}
                role="option"
                aria-selected={false}
                className={optClass(row, i)}
                onClick={() => pick(row.branch.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {showGraph && <GraphSvg row={row} rowIndex={i} numLanes={numLanes} firstRowIdx={firstRowIdx} lastRowIdx={lastRowIdx} />}
                <div className="tbp__option-content tbp__option-content--commit">
                  <GitMerge size={11} style={{ color: mergeColor, flexShrink: 0 }} />
                  <span className="tbp__commit-text tbp__merge-text" title={row.branch.title} style={{ color: mergeColor }}>
                    {row.branch.title}
                  </span>
                </div>
              </li>
            );
          }

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
                {showGraph && <GraphSvg row={row} rowIndex={i} numLanes={numLanes} firstRowIdx={firstRowIdx} lastRowIdx={lastRowIdx} />}
                <div className="tbp__option-content">
                  <div className="tbp__option-icon" style={{ color }}>
                    {isMain ? <MessageSquare size={14} /> : <GitBranch size={14} />}
                    {row.branch.savedToProject && (
                      <FolderCheck size={11} className="tbp__saved-icon" title="Im Projekt gespeichert" />
                    )}
                  </div>
                  <div className="tbp__option-body">
                    <div className="tbp__option-label">
                      <span
                        className="tbp__kind-badge"
                        style={{ background: `${color}22`, color }}
                      >
                        {isMain ? 'main' : 'thread'}
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
              {showGraph && <GraphSvg row={row} rowIndex={i} numLanes={numLanes} firstRowIdx={firstRowIdx} lastRowIdx={lastRowIdx} />}
              <div className="tbp__option-content tbp__option-content--commit">
                <span
                  className={`tbp__commit-tag ${row.isForkStart ? 'tbp__commit-tag--start' : 'tbp__commit-tag--end'}`}
                  style={{ color }}
                >
                  {row.isForkStart ? 'start' : 'tip'}
                </span>
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

  // ── Shared chrome ──────────────────────────────────────────────────────────

  const listContent = (
    <>
      <div className="tbp__header">
        <GitBranch size={14} className="tbp__header-icon" aria-hidden />
        <span className="tbp__header-title">Commit-Graph</span>
        <div className="tbp__header-badges">
          <span className="tbp__badge" style={{ background: `${LANE_COLORS[0]}22`, color: LANE_COLORS[0] }}>
            1 Main
          </span>
          {threads.length > 0 && (
            <span className="tbp__badge" style={{ background: `${LANE_COLORS[1]}22`, color: LANE_COLORS[1] }}>
              {threads.length}&thinsp;Thread{threads.length !== 1 ? 's' : ''}
            </span>
          )}
          {totalCommits > 0 && (
            <span className="tbp__badge tbp__badge--commits">
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
        <span className="tbp__hint">↑↓ navigieren · Enter wechseln · Esc schließen</span>
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
 * Git-inspired Multi-Lane Thread / Branch Picker
 *
 * Each branch occupies a dedicated vertical lane in the SVG graph:
 * - Lane 0 (blue):  Main chat — always the leftmost lane
 * - Lane 1 (green): First thread
 * - Lane N:         Nth thread (colour-cycled)
 *
 * Commits (user messages) are interleaved by message-index across branches,
 * approximating a parallel timeline without requiring per-message timestamps.
 * Fork connectors mark where each thread diverges from the main lane.
 *
 * In search mode the graph collapses to one row per branch.
 */
