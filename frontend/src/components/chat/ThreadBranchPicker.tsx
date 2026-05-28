import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Search,
  GitBranch,
  GitMerge,
  MessageSquare,
  FolderCheck,
  X,
} from "lucide-react";
import "./ThreadBranchPicker.css";

// ═══════════════════════════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ThreadBranchItem {
  id: string;
  title: string;
  messageCount?: number;
  /** Timestamp of the last activity */
  updatedAt?: number;
  /** Timestamp that considers ALL activity (messages, creation, merge events) */
  lastUpdated?: number;
  /** Timestamp when the conversation was created */
  createdAt?: number;
  savedToProject?: boolean;
  /** True when this thread has been summarised and merged into the parent chat */
  mergedToParent?: boolean;
  /** Text to display for the merge event */
  mergeText?: string;
  /** True when this thread has been closed (soft-deleted) */
  isClosed?: boolean;
  /** Parent conversation ID - for fork connector rendering */
  parentId?: string;
  /** Full message list - each user message becomes a commit */
  messages?: Array<{
    role: "user" | "assistant" | "tool" | "system";
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
  ariaLabel?: string;
  showGraph?: boolean;
  /** Render as always-visible inline panel */
  panel?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════════

interface InternalItem extends ThreadBranchItem {
  kind: "main" | "thread";
  isActive: boolean;
  lane: number;
  /** Lane of parent branch (for fork connector) */
  parentLane: number;
  /** Tree depth (main=0, direct thread=1, etc.) */
  depth: number;
}

type GraphEventType = "fork" | "commit" | "merge" | "head";

interface GraphEvent {
  type: GraphEventType;
  timestamp: number;
  branch: InternalItem;
  /** For commit: the message text */
  message?: string;
  /** For commit: message index */
  commitIndex?: number;
  /** For merge: target lane (always 0 for main) */
  targetLane?: number;
  /** Visual row kind */
  rowKind: GraphEventType;
}

interface GraphRow {
  event: GraphEvent;
  branch: InternalItem;
  lane: number;
  /** Lanes of OTHER branches whose vertical line passes fully through this row */
  activeLanes: number[];
  /** For fork: the parent lane to connect from */
  parentLane?: number;
  /** Is this the first row for this lane? */
  isLaneFirst: boolean;
  /** Is this the last row for this lane? */
  isLaneLast: boolean;
  /** True when this row's own lane line should continue below its node (open thread or has a child branching off later) */
  continuesBelow: boolean;
  /** Index in the list */
  index: number;
  /** Is this a closed thread's final head? */
  isClosedHead: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Horizontal pixels per lane */
const LANE_W = 16;
/** Fixed row height — no ResizeObserver needed */
const FIXED_ROW_H = 44;
/** Horizontal center of lane l */
const laneX = (l: number): number => l * LANE_W + 10;

/** Color palette for lanes */
const LANE_COLORS = [
  "#3b82f6", // blue - main
  "#22c55e", // green
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

const laneColor = (l: number): string =>
  LANE_COLORS[l % LANE_COLORS.length] ?? LANE_COLORS[0];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(ts).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

function toCommitText(content: string): string {
  const first = content.trim().split("\n")[0] ?? "";
  return first.length > 60 ? first.slice(0, 58) + "…" : first;
}

function getUserCommits(item: InternalItem): string[] {
  return (item.messages ?? [])
    .filter((m) => m.role === "user" && !m.hidden)
    .slice(0, 50)
    .map((m) => toCommitText(m.content));
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: Build Internal Items with Tree-based Lane Assignment
// ═══════════════════════════════════════════════════════════════════════════════

function buildInternalItems(
  main: ThreadBranchItem,
  threads: ThreadBranchItem[],
  activeId: string,
): InternalItem[] {
  // Sort threads once by creation time for stable ordering
  const sortedThreads = [...threads].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );

  const laneMap = new Map<string, number>();
  laneMap.set(main.id, 0);

  const items: InternalItem[] = [
    {
      ...main,
      kind: "main",
      isActive: main.id === activeId,
      lane: 0,
      parentLane: -1,
      depth: 0,
    },
  ];

  // Add all threads in stable chronological order
  let nextLane = 1;

  for (const thread of sortedThreads) {
    const parentId = thread.parentId ?? main.id;
    const parentLane = laneMap.get(parentId) ?? 0;

    const lane = nextLane++;
    laneMap.set(thread.id, lane);

    items.push({
      ...thread,
      kind: "thread",
      isActive: thread.id === activeId,
      lane,
      parentLane,
      depth: 1,
    });
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Build Graph Events — one head row per item (main first, threads by createdAt)
// ═══════════════════════════════════════════════════════════════════════════════

function buildGraphEvents(items: InternalItem[]): GraphEvent[] {
  return items.map((item) => ({
    type: "head" as GraphEventType,
    timestamp:
      item.createdAt ?? item.lastUpdated ?? item.updatedAt ?? Date.now(),
    branch: item,
    rowKind: "head" as GraphEventType,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Build Graph Rows — one row per event, isLaneLast flags the final row
// ═══════════════════════════════════════════════════════════════════════════════

function buildGraphRows(
  items: InternalItem[],
  events: GraphEvent[],
): { rows: GraphRow[]; numLanes: number } {
  const maxLane = Math.max(0, ...items.map((i) => i.lane));
  const lastIdx = events.length - 1;

  // items, events and rows share the same order, so the row index of a lane's
  // head equals that branch's position in the list.
  const headIdx = new Map<number, number>();
  items.forEach((it, idx) => headIdx.set(it.lane, idx));

  // Lowest row index at which each lane has a child branching off.
  const maxChildIdx = new Map<number, number>();
  items.forEach((it, idx) => {
    if (it.parentLane < 0) return;
    const cur = maxChildIdx.get(it.parentLane) ?? -1;
    if (idx > cur) maxChildIdx.set(it.parentLane, idx);
  });

  const isOpen = (it: InternalItem): boolean =>
    !it.mergedToParent && !it.isClosed;

  // bottomExtent[lane]: last row index (below the head) that should draw a
  // vertical line for this lane. Open branches run to the bottom; ended
  // (merged/closed) branches only reach down to just above their last child,
  // where the fork connector takes over.
  const bottomExtent = new Map<number, number>();
  items.forEach((it, idx) => {
    if (isOpen(it)) {
      bottomExtent.set(it.lane, lastIdx);
    } else {
      const mc = maxChildIdx.get(it.lane) ?? -1;
      bottomExtent.set(it.lane, mc > idx ? mc - 1 : idx);
    }
  });

  const rows: GraphRow[] = events.map((event, index) => {
    const ownLane = event.branch.lane;
    const ownMaxChild = maxChildIdx.get(ownLane) ?? -1;
    const continuesBelow =
      index !== lastIdx &&
      (isOpen(event.branch) || ownMaxChild > index);

    // Lanes of other branches whose line passes through this row.
    const activeLanes: number[] = [];
    items.forEach((it) => {
      if (it.lane === ownLane) return;
      const start = headIdx.get(it.lane) ?? 0;
      const end = bottomExtent.get(it.lane) ?? start;
      if (index > start && index <= end) activeLanes.push(it.lane);
    });

    return {
      event,
      branch: event.branch,
      lane: ownLane,
      activeLanes,
      parentLane:
        event.branch.parentLane >= 0 ? event.branch.parentLane : undefined,
      isLaneFirst: false,
      isLaneLast: index === lastIdx,
      continuesBelow,
      index,
      isClosedHead: !!event.branch.isClosed,
    };
  });

  return { rows, numLanes: maxLane + 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Git-style Graph SVG — fixed height, no ResizeObserver
// ═══════════════════════════════════════════════════════════════════════════════

interface GraphSvgProps {
  row: GraphRow;
  numLanes: number;
}

function GraphSvg({ row, numLanes }: GraphSvgProps) {
  const h = FIXED_ROW_H;
  const svgW = Math.max(laneX(numLanes - 1) + 20, 32);
  const lane = row.branch.lane;
  const cx = laneX(lane);
  const cy = h / 2;
  const mainX = laneX(0);
  const isMain = row.branch.kind === "main";
  const isClosed = row.branch.isClosed ?? false;
  const isMerged = row.branch.mergedToParent ?? false;
  const parentX = laneX(row.parentLane ?? 0);

  const nodeColor = isClosed ? "#64748b" : laneColor(lane);

  // Own lane vertical line: starts at the node (cy) and continues down to the
  // bottom of the row when the thread is still open or has a child branching
  // off below; otherwise it stops at the node.
  const ownY1 = cy;
  const ownY2 = row.continuesBelow ? h : cy;

  return (
    <div className="tbp__graph-cell" style={{ width: svgW, minWidth: svgW }}>
      <svg
        viewBox={`0 0 ${svgW} ${h}`}
        width={svgW}
        height={h}
        aria-hidden
        className="tbp__graph-svg"
      >
        {/* 1. Pass-through vertical lines for other lanes traversing this row */}
        {row.activeLanes.map((l) => (
          <line
            key={`pass-${l}`}
            x1={laneX(l)}
            y1={0}
            x2={laneX(l)}
            y2={h}
            stroke={laneColor(l)}
            strokeWidth={2}
            opacity={0.4}
          />
        ))}

        {/* 2. Own lane vertical line */}
        {ownY1 !== ownY2 && (
          <line
            x1={cx}
            y1={ownY1}
            x2={cx}
            y2={ownY2}
            stroke={nodeColor}
            strokeWidth={2}
            opacity={0.4}
          />
        )}

        {/* 3. Fork connector: cubic bezier from parent lane top → thread node */}
        {!isMain && (
          <path
            d={`M ${parentX},0 C ${parentX},${cy} ${parentX},${cy} ${cx},${cy}`}
            stroke={nodeColor}
            strokeWidth={1.5}
            fill="none"
            opacity={0.85}
            strokeLinecap="round"
          />
        )}

        {/* 3. Merge arc: thread lane curves back toward main (merged threads only) */}
        {isMerged && !isMain && (
          <path
            d={`M ${cx},${cy + 3} Q ${cx},${cy + 10} ${mainX},${cy + 10}`}
            stroke={nodeColor}
            strokeWidth={1.5}
            fill="none"
            opacity={0.45}
            strokeLinecap="round"
          />
        )}

        {/* 4. Node circle */}
        <circle
          cx={cx}
          cy={cy}
          r={isMain ? 5 : 4}
          fill={nodeColor}
          stroke="var(--bg-primary, #1e1e2e)"
          strokeWidth={isMain ? 2 : 1.5}
          opacity={isClosed ? 0.5 : 1}
        />

        {/* 5. Active selection ring */}
        {row.branch.isActive && !isClosed && (
          <circle
            cx={cx}
            cy={cy}
            r={isMain ? 8 : 7}
            fill="none"
            stroke={nodeColor}
            strokeWidth={1.5}
            opacity={0.4}
          />
        )}

        {/* 6. Closed indicator (×) */}
        {isClosed && (
          <>
            <line
              x1={cx - 2.5}
              y1={cy - 2.5}
              x2={cx + 2.5}
              y2={cy + 2.5}
              stroke="#64748b"
              strokeWidth={1.5}
            />
            <line
              x1={cx + 2.5}
              y1={cy - 2.5}
              x2={cx - 2.5}
              y2={cy + 2.5}
              stroke="#64748b"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function ThreadBranchPicker({
  main,
  threads,
  activeId,
  onSelect,
  disabled = false,
  className = "",
  ariaLabel = "Chat-Zweig wechseln",
  showGraph = true,
  panel = false,
}: ThreadBranchPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(panel); // Panel is always open
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build internal items with lane assignment
  const items = useMemo(
    () => buildInternalItems(main, threads, activeId),
    [main, threads, activeId],
  );

  // Build events and rows
  const events = useMemo(() => buildGraphEvents(items), [items]);
  const { rows, numLanes } = useMemo(
    () => buildGraphRows(items, events),
    [items, events],
  );

  const isFiltering = query.trim().length > 0;

  // Filter items for search mode
  const filtered = useMemo<InternalItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items
      .filter((i) => i.title.toLowerCase().includes(q))
      .sort((a, b) => {
        // Sort by lastUpdated descending (most recent activity first),
        // with createdAt and id as stable tiebreakers
        const aTime = a.lastUpdated ?? a.updatedAt ?? a.createdAt ?? 0;
        const bTime = b.lastUpdated ?? b.updatedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
      });
  }, [items, query]);

  const activeListLen = isFiltering ? filtered.length : rows.length;

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, activeListLen - 1)));
  }, [activeListLen]);

  // Actions
  const pick = useCallback(
    (id: string) => {
      onSelect(id);
      if (!panel) {
        setOpen(false);
        setQuery("");
      }
    },
    [onSelect, panel],
  );

  const openDropdown = useCallback(() => {
    if (disabled || panel) return;
    setOpen(true);
    setQuery("");
    const headIdx = rows.findIndex(
      (r) => r.branch.id === activeId && r.event.type === "head",
    );
    setSelectedIndex(headIdx >= 0 ? headIdx : 0);
  }, [disabled, panel, rows, activeId]);

  const closeDropdown = useCallback(() => {
    if (panel) return;
    setOpen(false);
    setQuery("");
  }, [panel]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (!open || panel) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, panel]);

  // Click outside to close (dropdown mode only)
  useEffect(() => {
    if (!open || panel) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, panel, closeDropdown]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const maxIdx = Math.max(activeListLen - 1, 0);
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, maxIdx));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (isFiltering && filtered.length > 0) {
            const item = filtered[selectedIndex];
            if (item && !item.isClosed) pick(item.id);
          } else if (!isFiltering && rows.length > 0) {
            const row = rows[selectedIndex];
            if (row && !row.branch.isClosed) pick(row.branch.id);
          }
          break;
      }
    },
    [
      activeListLen,
      closeDropdown,
      isFiltering,
      filtered,
      rows,
      selectedIndex,
      pick,
    ],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
        handleKeyDown(e);
      }
    },
    [handleKeyDown],
  );

  // CSS classes
  const rootClass = [
    "tbp",
    showGraph && "tbp--graph",
    panel && "tbp--panel",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Get active item
  const activeItem = useMemo(
    () => items.find((i) => i.id === activeId) ?? items[0],
    [items, activeId],
  );

  // Filter list (search mode)
  const filterList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {filtered.length === 0 ? (
        <li className="tbp__empty" role="presentation">
          Kein passender Branch gefunden
        </li>
      ) : (
        filtered.map((item, i) => {
          const isMain = item.kind === "main";
          const isClosed = item.isClosed;
          const msgLabel =
            item.messageCount !== undefined
              ? `${item.messageCount} Nachr.`
              : null;
          const timeLabel = item.updatedAt
            ? formatRelativeTime(item.updatedAt)
            : null;
          const color = laneColor(item.lane >= 0 ? item.lane : 0);

          return (
            <li
              key={item.id}
              role={isClosed ? "presentation" : "option"}
              aria-selected={item.isActive}
              aria-disabled={isClosed}
              className={[
                "tbp__option tbp__option--head",
                i === selectedIndex && "tbp__option--keyboard",
                item.isActive && "tbp__option--current",
                isMain ? "tbp__option--main" : "tbp__option--thread",
                isClosed && "tbp__option--closed",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={isClosed ? undefined : () => pick(item.id)}
              onMouseEnter={isClosed ? undefined : () => setSelectedIndex(i)}
            >
              <div className="tbp__option-content">
                <div className="tbp__option-icon" style={{ color }}>
                  {isMain ? (
                    <MessageSquare size={14} />
                  ) : isClosed ? (
                    <X size={14} />
                  ) : (
                    <GitBranch size={14} />
                  )}
                  {item.savedToProject && !isClosed && (
                    <FolderCheck size={11} className="tbp__saved-icon" />
                  )}
                </div>
                <div className="tbp__option-body">
                  <div className="tbp__option-label">
                    <span
                      className="tbp__kind-badge"
                      style={{
                        background: isClosed
                          ? "rgba(148,163,184,0.12)"
                          : `${color}22`,
                        color: isClosed ? "#94a3b8" : color,
                      }}
                    >
                      {isMain ? "main" : isClosed ? "geschlossen" : "thread"}
                    </span>
                    <span className="tbp__option-title" title={item.title}>
                      {item.title}
                    </span>
                  </div>
                  {(msgLabel || timeLabel) && (
                    <div className="tbp__option-meta">
                      {msgLabel && (
                        <span className="tbp__meta-chip">{msgLabel}</span>
                      )}
                      {msgLabel && timeLabel && (
                        <span className="tbp__meta-sep" aria-hidden>
                          ·
                        </span>
                      )}
                      {timeLabel && (
                        <span className="tbp__meta-time">{timeLabel}</span>
                      )}
                    </div>
                  )}
                </div>
                {item.isActive && (
                  <Check size={14} className="tbp__option-check" aria-hidden />
                )}
              </div>
            </li>
          );
        })
      )}
    </ul>
  );

  // Graph list — one row per branch
  const commitList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {rows.length === 0 ? (
        <li className="tbp__empty" role="presentation">
          Keine Zweige vorhanden
        </li>
      ) : (
        rows.map((row, i) => {
          const isMain = row.branch.kind === "main";
          const isClosed = row.branch.isClosed;
          const isMerged = row.branch.mergedToParent;
          const color = laneColor(row.lane);

          const commitCount = getUserCommits(row.branch).length;
          const msgLabel =
            row.branch.messageCount !== undefined
              ? `${row.branch.messageCount} Nachr.`
              : null;
          const timeLabel = row.branch.lastUpdated
            ? formatRelativeTime(row.branch.lastUpdated)
            : row.branch.updatedAt
              ? formatRelativeTime(row.branch.updatedAt)
              : null;

          const badgeBg = isClosed
            ? "rgba(148,163,184,0.12)"
            : isMerged
              ? "rgba(34,197,94,0.12)"
              : `${color}22`;
          const badgeColor = isClosed
            ? "#94a3b8"
            : isMerged
              ? "#22c55e"
              : color;
          const badgeLabel = isMain
            ? "main"
            : isClosed
              ? "geschlossen"
              : isMerged
                ? "merged"
                : "thread";

          return (
            <li
              key={`${row.branch.id}::head`}
              role={isClosed ? "presentation" : "option"}
              aria-selected={row.branch.isActive}
              aria-disabled={isClosed}
              className={[
                "tbp__option tbp__option--head",
                isMain && "tbp__option--main",
                !isMain && "tbp__option--thread",
                row.branch.isActive && "tbp__option--current",
                i === selectedIndex && "tbp__option--keyboard",
                isClosed && "tbp__option--closed",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={isClosed ? undefined : () => pick(row.branch.id)}
              onMouseEnter={isClosed ? undefined : () => setSelectedIndex(i)}
            >
              {showGraph && <GraphSvg row={row} numLanes={numLanes} />}
              <div className="tbp__option-content">
                <div className="tbp__option-icon" style={{ color }}>
                  {isMain ? (
                    <MessageSquare size={14} />
                  ) : isClosed ? (
                    <X size={14} />
                  ) : isMerged ? (
                    <GitMerge size={14} />
                  ) : (
                    <GitBranch size={14} />
                  )}
                  {row.branch.savedToProject && !isClosed && (
                    <FolderCheck size={11} className="tbp__saved-icon" />
                  )}
                </div>
                <div className="tbp__option-body">
                  <div className="tbp__option-label">
                    <span
                      className="tbp__kind-badge"
                      style={{ background: badgeBg, color: badgeColor }}
                    >
                      {badgeLabel}
                    </span>
                    <span
                      className="tbp__option-title"
                      title={row.branch.title}
                      style={{
                        textDecoration: isClosed ? "line-through" : undefined,
                        opacity: isClosed ? 0.6 : 1,
                      }}
                    >
                      {row.branch.title}
                    </span>
                  </div>
                  {(msgLabel || commitCount > 0 || timeLabel) && (
                    <div className="tbp__option-meta">
                      {msgLabel && (
                        <span className="tbp__meta-chip">{msgLabel}</span>
                      )}
                      {commitCount > 0 && (
                        <span className="tbp__meta-chip tbp__meta-chip--commit">
                          {commitCount} {commitCount === 1 ? "commit" : "commits"}
                        </span>
                      )}
                      {(msgLabel || commitCount > 0) && timeLabel && (
                        <span className="tbp__meta-sep" aria-hidden>
                          ·
                        </span>
                      )}
                      {timeLabel && (
                        <span className="tbp__meta-time">{timeLabel}</span>
                      )}
                    </div>
                  )}
                </div>
                {row.branch.isActive && !isClosed && (
                  <Check size={14} className="tbp__option-check" aria-hidden />
                )}
              </div>
            </li>
          );
        })
      )}
    </ul>
  );

  // Count for header
  const activeThreads = threads.filter((t) => !t.isClosed).length;
  const totalCommits = items.reduce(
    (n, item) =>
      n +
      (item.messages?.filter((m) => m.role === "user" && !m.hidden).length ??
        0),
    0,
  );

  // Render
  return (
    <div
      ref={rootRef}
      className={rootClass}
      onKeyDown={handleKeyDown}
      data-testid="chat-thread-split-picker"
    >
      {/* Trigger button (dropdown mode only) */}
      {!panel && (
        <button
          type="button"
          className="tbp__trigger"
          onClick={openDropdown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
        >
          <GitBranch size={14} className="tbp__trigger-icon" />
          <span className="tbp__trigger-label" title={activeItem?.title}>
            {activeItem?.title || "Branch wählen…"}
          </span>
          <ChevronDown
            size={14}
            className={[
              "tbp__trigger-chevron",
              open && "tbp__trigger-chevron--open",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </button>
      )}

      {/* Dropdown / Panel content */}
      {(open || panel) && (
        <div
          className={panel ? "tbp__panel" : "tbp__dropdown"}
          role={panel ? undefined : "presentation"}
        >
          {/* Header */}
          <div className="tbp__header">
            <GitBranch size={14} className="tbp__header-icon" />
            <span className="tbp__header-title">
              {panel ? "Threads & Branches" : "Branch wechseln"}
            </span>
            <div className="tbp__header-badges">
              <span className="tbp__badge tbp__badge--commits">
                {totalCommits} commits
              </span>
              {activeThreads > 0 && (
                <span className="tbp__badge tbp__badge--threads">
                  {activeThreads} threads
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="tbp__search-row">
            <Search size={14} className="tbp__search-icon" />
            <input
              ref={searchRef}
              type="text"
              className="tbp__search-input"
              placeholder="Branch suchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          {/* List */}
          {isFiltering ? filterList : commitList}

          {/* Footer hints */}
          <div className="tbp__footer">
            <span className="tbp__hint">
              ↑↓ auswählen · Enter öffnen · Esc schließen
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
