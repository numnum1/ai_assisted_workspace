import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  GitCommit,
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
  /** Lanes that should draw a vertical line through this row */
  activeLanes: number[];
  /** For fork: the parent lane to connect from */
  parentLane?: number;
  /** Is this the first row for this lane? */
  isLaneFirst: boolean;
  /** Is this the last row for this lane? */
  isLaneLast: boolean;
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
/** Minimum row height */
const ROW_H = 32;
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

    let lane = -1;
    if (!thread.isClosed) {
      lane = nextLane++;
      laneMap.set(thread.id, lane);
    }

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
// NEW: Build Graph Events (chronological timeline)
// ═══════════════════════════════════════════════════════════════════════════════

function buildGraphEvents(items: InternalItem[]): GraphEvent[] {
  const events: GraphEvent[] = [];

  for (const item of items) {
    const isMain = item.kind === "main";

    // Fork event (creation) — only for threads
    if (!isMain) {
      events.push({
        type: "fork",
        timestamp:
          item.createdAt ?? item.lastUpdated ?? item.updatedAt ?? Date.now(),
        branch: item,
        rowKind: "fork",
      });
    }

    // Commit events (user messages) — only for threads
    if (!isMain) {
      const commits = getUserCommits(item);
      if (commits.length > 0) {
        // Always show first commit
        events.push({
          type: "commit",
          timestamp:
            item.lastUpdated ?? item.updatedAt ?? item.createdAt ?? Date.now(),
          branch: item,
          message: commits[0],
          commitIndex: 1,
          rowKind: "commit",
        });

        // Show last commit (tip) only if not merged
        if (!item.mergedToParent && commits.length > 1) {
          events.push({
            type: "commit",
            timestamp: item.lastUpdated ?? item.updatedAt ?? Date.now(),
            branch: item,
            message: commits[commits.length - 1],
            commitIndex: commits.length,
            rowKind: "commit",
          });
        }
      }
    }

    // Merge event — thread merges back into main (sits on main lane)
    if (!isMain && item.mergedToParent) {
      events.push({
        type: "merge",
        timestamp: item.lastUpdated ?? item.updatedAt ?? Date.now(),
        branch: item,
        targetLane: 0,
        message: item.mergeText || "Merged to main",
        rowKind: "merge",
      });
    }

    // Head event — always for main, for threads only if not merged and not closed
    if (isMain || (!item.mergedToParent && !item.isClosed)) {
      events.push({
        type: "head",
        timestamp: item.lastUpdated ?? item.updatedAt ?? Date.now(),
        branch: item,
        rowKind: "head",
      });
    }
  }

  // Completely stable sort: timestamp → type priority → id (as string tiebreaker)
  // This prevents any reordering when clicking different branches.
  const typePriority: Record<GraphEventType, number> = {
    fork: 0,
    commit: 1,
    merge: 2,
    head: 3,
  };

  events.sort((a, b) => {
    const timeDiff = a.timestamp - b.timestamp;
    if (timeDiff !== 0) return timeDiff;

    const typeDiff = typePriority[a.rowKind] - typePriority[b.rowKind];
    if (typeDiff !== 0) return typeDiff;

    // Final stable tiebreaker using string id
    return a.branch.id.localeCompare(b.branch.id);
  });

  return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: Build Graph Rows with proper active lane tracking
// ═══════════════════════════════════════════════════════════════════════════════

function buildGraphRows(
  items: InternalItem[],
  events: GraphEvent[],
): { rows: GraphRow[]; numLanes: number } {
  const maxLane = Math.max(0, ...items.map((i) => i.lane), 0);

  // Track first and last occurrence per lane (for vertical lines)
  const firstRowForLane = new Array(maxLane + 1).fill(-1);
  const lastRowForLane = new Array(maxLane + 1).fill(-1);

  // Build rows
  const rows: GraphRow[] = events.map((event, index) => {
    // Merge events sit visually on main lane (0), but their source lane
    // (the thread being merged) also ends at this row
    const isMerge = event.type === "merge";
    const visualLane = isMerge ? 0 : event.branch.lane;

    // Track visual lane usage
    if (visualLane >= 0) {
      if (firstRowForLane[visualLane] === -1)
        firstRowForLane[visualLane] = index;
      lastRowForLane[visualLane] = index;
    }

    // For merge events, also track the source thread lane ending here
    if (isMerge && event.branch.lane > 0) {
      if (firstRowForLane[event.branch.lane] === -1) {
        firstRowForLane[event.branch.lane] = index;
      }
      lastRowForLane[event.branch.lane] = index;
    }

    return {
      event,
      branch: event.branch,
      lane: visualLane,
      activeLanes: [], // filled in second pass
      parentLane:
        event.branch.parentLane >= 0 ? event.branch.parentLane : undefined,
      isLaneFirst: false,
      isLaneLast: false,
      index,
      isClosedHead: !!(event.branch.isClosed && event.type === "head"),
    };
  });

  // Second pass: determine active lanes per row
  rows.forEach((row, index) => {
    row.activeLanes = [];

    for (let l = 0; l <= maxLane; l++) {
      // Main lane (0) is always active
      if (l === 0) {
        row.activeLanes.push(l);
        continue;
      }

      // For other lanes: check if this row is within the lane's active range
      const firstIdx = firstRowForLane[l];
      const lastIdx = lastRowForLane[l];

      if (firstIdx === -1) continue; // Lane never used

      // Lane is active from its first row to its last row
      if (index >= firstIdx && index <= lastIdx) {
        row.activeLanes.push(l);
      }
    }

    // Mark first/last ONLY for this row's own lane
    if (row.lane >= 0) {
      if (index === firstRowForLane[row.lane]) row.isLaneFirst = true;
      if (index === lastRowForLane[row.lane]) row.isLaneLast = true;
    }
  });

  return { rows, numLanes: maxLane + 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: Git-style Graph SVG Component
// ═══════════════════════════════════════════════════════════════════════════════

interface GraphSvgProps {
  row: GraphRow;
  numLanes: number;
}

function GraphSvg({ row, numLanes }: GraphSvgProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(ROW_H);

  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setCellH((prev) => {
        const next = Math.max(ROW_H, Math.round(h * 100) / 100);
        return Math.abs(prev - next) < 0.25 ? prev : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svgW = Math.max(numLanes * LANE_W + 12, 40);
  const h = cellH;
  const cx = row.lane >= 0 ? laneX(row.lane) : laneX(0);
  const cy = h / 2;
  const mainX = laneX(0);

  // Node radius based on type
  const nodeR =
    row.event.type === "head"
      ? row.branch.isClosed
        ? 3
        : 5
      : row.event.type === "merge"
        ? 4
        : 3;

  // Color based on branch lane
  const color =
    row.event.type === "merge"
      ? laneColor(row.branch.lane)
      : laneColor(row.lane >= 0 ? row.lane : 0);

  // Node position: merge and closed heads sit on main lane
  const nodeCx =
    row.event.type === "merge"
      ? mainX
      : row.branch.isClosed && row.event.type === "head"
        ? mainX
        : cx;

  return (
    <div
      ref={cellRef}
      className="tbp__graph-cell"
      style={{ width: svgW, minWidth: svgW }}
    >
      <svg viewBox={`0 0 ${svgW} ${h}`} aria-hidden className="tbp__graph-svg">
        {/* 1. Vertical lines for active lanes */}
        {row.activeLanes.map((l) => {
          const x = laneX(l);
          const isMain = l === 0;
          const isThisLane = l === row.lane;

          // Determine y1 and y2 based on row position in lane lifecycle
          let y1 = 0;
          let y2 = h;

          if (isThisLane) {
            // This row's lane
            if (row.isLaneFirst) {
              // First row: start from center (fork point)
              y1 = cy;
            }
            if (row.isLaneLast) {
              // Last row: end at center
              y2 = cy;
            }
          }

          return (
            <line
              key={l}
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke={laneColor(l)}
              strokeWidth={isMain ? 2.5 : 2}
              opacity={isMain ? 0.45 : 0.35}
            />
          );
        })}

        {/* 2. Fork connector: from parent lane to this lane */}
        {row.event.type === "fork" &&
          row.parentLane !== undefined &&
          row.lane > row.parentLane && (
            <path
              d={`M ${laneX(row.parentLane)},${cy}
                  L ${cx - 6},${cy}
                  Q ${cx},${cy} ${cx},${cy + 4}`}
              stroke={color}
              strokeWidth={2}
              fill="none"
              opacity={0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

        {/* 3. Merge connector: from thread lane to main lane
             The thread's vertical line ends at cy (isLaneLast), and the
             connector curves smoothly from the thread lane to the merge node
             on the main lane. */}
        {row.event.type === "merge" && row.branch.lane > 0 && (
          <path
            d={`M ${laneX(row.branch.lane)},${cy}
                C ${laneX(row.branch.lane) + 6},${cy} ${mainX - 6},${cy} ${mainX},${cy}`}
            stroke={laneColor(row.branch.lane)}
            strokeWidth={2.5}
            fill="none"
            opacity={0.9}
            strokeLinecap="round"
          />
        )}

        {/* 4. Node circle */}
        <circle
          cx={nodeCx}
          cy={cy}
          r={nodeR}
          fill={
            row.branch.isClosed && row.event.type === "head"
              ? "#94a3b8" // Gray for closed
              : color
          }
          stroke="var(--bg-primary, #1e1e2e)"
          strokeWidth={
            row.event.type === "head" && !row.branch.isClosed ? 2 : 1.5
          }
          opacity={
            row.event.type === "head" && !row.branch.isClosed
              ? 1
              : row.branch.isClosed
                ? 0.5
                : 0.85
          }
        />

        {/* 5. Active branch ring */}
        {row.event.type === "head" &&
          row.branch.isActive &&
          !row.branch.isClosed && (
            <circle
              cx={nodeCx}
              cy={cy}
              r={nodeR + 3}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              opacity={0.5}
            />
          )}

        {/* 6. Closed indicator (X) for closed threads */}
        {row.branch.isClosed && row.event.type === "head" && (
          <>
            <line
              x1={nodeCx - 2}
              y1={cy - 2}
              x2={nodeCx + 2}
              y2={cy + 2}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <line
              x1={nodeCx + 2}
              y1={cy - 2}
              x2={nodeCx - 2}
              y2={cy + 2}
              stroke="#94a3b8"
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

  // Commit graph list (normal mode)
  const commitList = (
    <ul id={listId} className="tbp__list" role="listbox" aria-label={ariaLabel}>
      {rows.length === 0 ? (
        <li className="tbp__empty" role="presentation">
          Keine Zweige vorhanden
        </li>
      ) : (
        rows.map((row, i) => {
          const isMain = row.branch.kind === "main";
          const color = laneColor(row.lane >= 0 ? row.lane : 0);
          const isClosed = row.branch.isClosed;

          // Merge row
          if (row.event.type === "merge") {
            return (
              <li
                key={`${row.branch.id}::merge`}
                role="option"
                aria-selected={false}
                className={[
                  "tbp__option tbp__option--merge",
                  i === selectedIndex && "tbp__option--keyboard",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => pick(row.branch.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {showGraph && <GraphSvg row={row} numLanes={numLanes} />}
                <div className="tbp__option-content tbp__option-content--commit">
                  <GitMerge size={12} style={{ color, flexShrink: 0 }} />
                  <span
                    className="tbp__commit-text tbp__merge-text"
                    title={row.event.message}
                  >
                    {row.event.message}
                  </span>
                </div>
              </li>
            );
          }

          // Commit row
          if (row.event.type === "commit") {
            return (
              <li
                key={`${row.branch.id}::commit-${row.event.commitIndex ?? 0}`}
                role="option"
                aria-selected={false}
                className={[
                  "tbp__option tbp__option--commit",
                  row.branch.isActive && "tbp__option--active-branch",
                  i === selectedIndex && "tbp__option--keyboard",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => pick(row.branch.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {showGraph && <GraphSvg row={row} numLanes={numLanes} />}
                <div className="tbp__option-content tbp__option-content--commit">
                  <GitCommit
                    size={10}
                    style={{ color, flexShrink: 0, opacity: 0.7 }}
                  />
                  <span className="tbp__commit-tag">
                    {row.event.commitIndex === 1 ? "start" : "tip"}
                  </span>
                  <span className="tbp__commit-text" title={row.event.message}>
                    {row.event.message}
                  </span>
                </div>
              </li>
            );
          }

          // Fork row - visual indicator only, no separate interaction
          if (row.event.type === "fork" && !isMain) {
            return (
              <li
                key={`${row.branch.id}::fork`}
                role="presentation"
                className={[
                  "tbp__option tbp__option--fork",
                  i === selectedIndex && "tbp__option--keyboard",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => !isClosed && pick(row.branch.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {showGraph && <GraphSvg row={row} numLanes={numLanes} />}
                <div className="tbp__option-content tbp__option-content--commit">
                  <GitBranch
                    size={10}
                    style={{ color, flexShrink: 0, opacity: 0.7 }}
                  />
                  <span className="tbp__commit-text" style={{ opacity: 0.6 }}>
                    Branch erstellt
                  </span>
                </div>
              </li>
            );
          }

          // Head row (branch selector)
          const msgLabel =
            row.branch.messageCount !== undefined
              ? `${row.branch.messageCount} Nachr.`
              : null;
          const timeLabel = row.branch.lastUpdated
            ? formatRelativeTime(row.branch.lastUpdated)
            : row.branch.updatedAt
              ? formatRelativeTime(row.branch.updatedAt)
              : null;

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
                      style={{
                        background: isClosed
                          ? "rgba(148,163,184,0.12)"
                          : `${color}22`,
                        color: isClosed ? "#94a3b8" : color,
                      }}
                    >
                      {isMain ? "main" : isClosed ? "geschlossen" : "thread"}
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
