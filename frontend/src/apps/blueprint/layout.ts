import type { BlueprintGraph, BlueprintNode, BlueprintPin } from "../../shared/types.ts";

/** Rendered node width — kept in sync with `.bp-node`'s fixed width in CSS. */
export const NODE_WIDTH = 340;

/** Default pixels per unit on the unitless time axis (X); the live value is
 * configurable per document via `BlueprintData.unitPx`. */
export const DEFAULT_UNIT_PX = 420;

/** Bounds and step for the configurable grid spacing. One time unit never gets
 * narrower than a node, so a node placed on a unit boundary always fits inside
 * its column instead of spilling across the gutter into the next one. */
export const MIN_UNIT_PX = NODE_WIDTH + 40;
export const MAX_UNIT_PX = 900;
export const UNIT_PX_STEP = 20;

/** Horizontal gutter (px) inserted after every column band. Everything past a
 * column — bands *and* nodes — shifts right by one gap per crossed column. */
export const DEFAULT_COLUMN_GAP = 100;
export const MAX_COLUMN_GAP = 300;
export const COLUMN_GAP_STEP = 10;

/** Breathing room (px) an event node keeps on each side of its own Von–Bis
 * span, so it reads as sitting *inside* its time range/column instead of
 * exactly filling it edge-to-edge. */
export const NODE_MARGIN = 14;

type TimeRange = { from: number; to: number };

function byStartTime(columns: TimeRange[]): TimeRange[] {
  return [...columns].sort((a, b) => a.from - b.from);
}

/** Accumulated gutter width preceding time `t`. A boundary is "passed"
 * inclusively for a left edge (something starting at a column's end belongs
 * *after* the gutter) but exclusively for a right edge (something ending there
 * stops *before* it) — otherwise spans would swallow their trailing gutter. */
function gapsBefore(
  t: number,
  columns: TimeRange[],
  gap: number,
  inclusive: boolean,
): number {
  if (gap <= 0) return 0;
  let shift = 0;
  for (const col of byStartTime(columns)) {
    if (inclusive ? t < col.to : t <= col.to) break;
    shift += gap;
  }
  return shift;
}

/** Time → canvas X for a *left* edge (node position, column band start). */
export function timeToX(
  t: number,
  columns: TimeRange[],
  unitPx: number,
  gap: number,
): number {
  return t * unitPx + gapsBefore(t, columns, gap, true);
}

/** Time → canvas X for a *right* edge (node/band end). Ending exactly on a
 * column boundary stops at the gutter instead of reaching across it. */
export function spanEndX(
  t: number,
  columns: TimeRange[],
  unitPx: number,
  gap: number,
): number {
  return t * unitPx + gapsBefore(t, columns, gap, false);
}

/** Rendered width of an event node: it spans its own Von–Bis stretch of the
 * axis (crossed gutters included). Undefined or empty spans fall back to a
 * single node width, so a point-in-time event still reads as a normal node. */
export function eventWidth(
  node: Pick<BlueprintNode, "from" | "to">,
  columns: TimeRange[],
  unitPx: number,
  gap: number,
): number {
  const { from, to } = node;
  if (from === undefined || to === undefined || to <= from) return NODE_WIDTH;
  return Math.max(
    NODE_WIDTH,
    spanEndX(to, columns, unitPx, gap) - timeToX(from, columns, unitPx, gap),
  );
}

/** An event node's rendered box: inset by {@link NODE_MARGIN} on each side of
 * its Von–Bis span, so it never touches its column's edges or a neighbouring
 * node's gutter. The single place that combines position and width for
 * rendering — callers should never add the margin themselves. */
export function eventBox(
  node: Pick<BlueprintNode, "from" | "to">,
  columns: TimeRange[],
  unitPx: number,
  gap: number,
): { x: number; width: number } | undefined {
  if (node.from === undefined) return undefined;
  return {
    x: timeToX(node.from, columns, unitPx, gap) + NODE_MARGIN,
    width: eventWidth(node, columns, unitPx, gap) - 2 * NODE_MARGIN,
  };
}

/** Inverse of {@link timeToX} — used to turn a drop position back into a time.
 * Tries each gutter level and keeps the one whose time lands in that level's
 * own stretch of the axis. */
export function xToTime(
  x: number,
  columns: TimeRange[],
  unitPx: number,
  gap: number,
): number {
  if (gap <= 0) return x / unitPx;
  const cols = byStartTime(columns);
  for (let level = 0; level <= cols.length; level++) {
    const t = (x - level * gap) / unitPx;
    const lower = level === 0 ? -Infinity : cols[level - 1].to;
    const upper = level < cols.length ? cols[level].to : Infinity;
    if (t >= lower && t < upper) return t;
  }
  return x / unitPx;
}

/** Fallback scale for deriving a node's time from a stored pixel X — only hit
 * for legacy nodes that predate the `from` field; scale-independent for the
 * lane ordering that uses it, so the default is fine even at other zooms. */
const TIME_UNIT_PX = DEFAULT_UNIT_PX;

/** Vertical spacing between auto-arranged lanes. */
export const NODE_LANE_HEIGHT = 140;

/** Y of the first auto-arranged lane. */
export const BASE_Y = 60;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function startOf(node: BlueprintNode): number {
  return node.from ?? node.x / TIME_UNIT_PX;
}

/**
 * Flow-aware lane assignment. Instead of packing purely by time, lanes follow
 * the execution wiring so the layout reads like the story flow: a linear chain
 * stays on one lane (a single horizontal line), and every extra branch out of a
 * node fans onto its own lane below. Walking outputs earliest-first keeps the
 * top-to-bottom order of branches stable and minimizes crossing wires.
 */
export function assignLanes(
  nodes: BlueprintNode[],
  edges: Array<{ source: string; target: string }> = [],
): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n.id, []);
    indegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    children.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const byStart = (a: string, b: string) => startOf(byId.get(a)!) - startOf(byId.get(b)!);
  for (const list of children.values()) list.sort(byStart);

  const laneOf = new Map<string, number>();
  let nextLane = 0;
  const visit = (id: string, lane: number) => {
    if (laneOf.has(id)) return;
    laneOf.set(id, lane);
    let inheritsLane = true;
    for (const child of children.get(id)!) {
      if (laneOf.has(child)) continue;
      visit(child, inheritsLane ? lane : nextLane++);
      inheritsLane = false;
    }
  };

  const roots = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => startOf(a) - startOf(b));
  for (const root of roots) visit(root.id, nextLane++);
  // Any node unreached from a root (e.g. inside a cycle) still needs a lane.
  for (const n of nodes) if (!laneOf.has(n.id)) laneOf.set(n.id, nextLane++);
  return laneOf;
}

/** A container's time span is derived, never manual: the min/max of its
 * sub-graph's content nodes (tunnel nodes don't carry time). */
export function deriveSpan(graph: BlueprintGraph): { from?: number; to?: number } {
  const contentNodes = graph.nodes.filter((n) => n.kind === "event" || n.kind === "reroute");
  if (contentNodes.length === 0) return { from: undefined, to: undefined };
  let from = Infinity;
  let to = -Infinity;
  for (const n of contentNodes) {
    const start = startOf(n);
    const end = n.to ?? start;
    if (start < from) from = start;
    if (end > to) to = end;
  }
  return { from, to };
}

/**
 * Keep a container's sub-graph tunnel `exit` nodes in sync with its current
 * output pins: rename existing exits, add new ones, drop stale ones (and any
 * edges that pointed at them). The `entry` node and every other content node
 * are left untouched.
 */
export function syncTunnelExits(graph: BlueprintGraph, outputs: BlueprintPin[]): BlueprintGraph {
  const keepPinIds = new Set(outputs.map((p) => p.id));
  const existingByPin = new Map(
    graph.nodes
      .filter((n) => n.kind === "exit" && n.pinId)
      .map((n) => [n.pinId as string, n]),
  );

  const survivingNodes = graph.nodes.filter(
    (n) => n.kind !== "exit" || (n.pinId !== undefined && keepPinIds.has(n.pinId)),
  );
  const renamedNodes = survivingNodes.map((n) => {
    if (n.kind !== "exit" || !n.pinId) return n;
    const pin = outputs.find((p) => p.id === n.pinId);
    return pin && pin.label !== n.title ? { ...n, title: pin.label } : n;
  });

  const existingExitCount = renamedNodes.filter((n) => n.kind === "exit").length;
  const addedNodes: BlueprintNode[] = outputs
    .filter((pin) => !existingByPin.has(pin.id))
    .map((pin, i) => ({
      id: newId("node"),
      kind: "exit",
      title: pin.label,
      description: "",
      status: "idee",
      x: 520,
      y: BASE_Y + (existingExitCount + i) * 110,
      outputs: [],
      pinId: pin.id,
    }));

  const removedNodeIds = new Set(
    graph.nodes
      .filter((n) => n.kind === "exit" && n.pinId !== undefined && !keepPinIds.has(n.pinId))
      .map((n) => n.id),
  );
  const nextEdges = graph.edges.filter((e) => !removedNodeIds.has(e.target));

  return { ...graph, nodes: [...renamedNodes, ...addedNodes], edges: nextEdges };
}
