import type { BlueprintNode } from "../../shared/types.ts";

/** Pixels per unit on the unitless time axis (X). */
export const TIME_UNIT_PX = 200;

/** Vertical spacing between auto-arranged lanes. */
export const NODE_LANE_HEIGHT = 140;

/** Y of the first auto-arranged lane. */
export const BASE_Y = 60;

function startOf(node: BlueprintNode): number {
  return node.from ?? node.x / TIME_UNIT_PX;
}

/**
 * Greedy interval-scheduling lane assignment: nodes whose time ranges overlap
 * land in different lanes; non-overlapping nodes reuse the same lane.
 */
export function assignLanes(nodes: BlueprintNode[]): Map<string, number> {
  const sorted = [...nodes].sort((a, b) => startOf(a) - startOf(b));
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const node of sorted) {
    const start = startOf(node);
    const end = node.to ?? start;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneOf.set(node.id, lane);
  }
  return laneOf;
}
