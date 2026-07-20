import type { BlueprintGraph, BlueprintNode, BlueprintPin } from "../../shared/types.ts";

/** Pixels per unit on the unitless time axis (X). */
export const TIME_UNIT_PX = 200;

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
