import { describe, expect, it } from "vitest";
import {
  assignLanes,
  BASE_Y,
  laneTops,
  MIN_NODE_HEIGHT,
  deriveSpan,
  eventBox,
  eventWidth,
  NODE_MARGIN,
  NODE_WIDTH,
  spanEndX,
  syncTunnelExits,
  timeToX,
  xToTime,
} from "./layout.ts";
import type { BlueprintGraph, BlueprintNode } from "../../shared/types.ts";

function event(id: string, from: number, to?: number): BlueprintNode {
  return {
    id,
    kind: "event",
    title: id,
    description: "",
    status: "idee",
    x: from * 200,
    y: 0,
    from,
    to,
    outputs: [],
  };
}

describe("assignLanes", () => {
  it("keeps a linear chain on one lane", () => {
    const lanes = assignLanes(
      [event("a", 0), event("b", 1), event("c", 2)],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    );
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(0);
  });

  it("fans a node's branches onto separate lanes, earliest branch on top", () => {
    const lanes = assignLanes(
      [event("a", 0), event("b", 1), event("c", 2)],
      [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    );
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(1);
  });

  it("orders same-time branches by output pin, not by edge/target order", () => {
    const a: BlueprintNode = {
      ...event("a", 0),
      outputs: [
        { id: "pin_danach", label: "danach" },
        { id: "pin_neu", label: "neuer Ausgang" },
      ],
    };
    const lanes = assignLanes(
      [a, event("b", 1), event("c", 1)],
      [
        { source: "a", target: "c", sourcePin: "pin_neu" },
        { source: "a", target: "b", sourcePin: "pin_danach" },
      ],
    );
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(1);
  });

  it("drops a chain node onto the next lane when it would overlap its parent", () => {
    const extents: Record<string, { left: number; right: number }> = {
      a: { left: 0, right: 400 },
      b: { left: 100, right: 500 },
      c: { left: 600, right: 800 },
    };
    const lanes = assignLanes(
      [event("a", 0), event("b", 1), event("c", 3)],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
      (n) => extents[n.id],
    );
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(lanes.get("c")).toBe(0);
  });

  it("gives each disconnected root its own lane, in time order", () => {
    const lanes = assignLanes([event("late", 5), event("early", 0)]);
    expect(lanes.get("early")).toBe(0);
    expect(lanes.get("late")).toBe(1);
  });
});

describe("laneTops", () => {
  it("stacks lanes by their tallest node plus the gap", () => {
    const tops = laneTops(new Map([[0, 200], [1, 120]]), 40);
    expect(tops.get(0)).toBe(BASE_Y);
    expect(tops.get(1)).toBe(BASE_Y + 240);
  });

  it("never packs a lane tighter than a minimum node height", () => {
    const tops = laneTops(new Map([[0, 10], [1, 10]]), 0);
    expect(tops.get(1)).toBe(BASE_Y + MIN_NODE_HEIGHT);
  });

  it("ignores lane numbers left unused by overlap separation", () => {
    const tops = laneTops(new Map([[0, 100], [3, 100]]), 20);
    expect([...tops.keys()]).toEqual([0, 3]);
    expect(tops.get(3)).toBe(BASE_Y + 120);
  });
});

describe("timeToX / xToTime", () => {
  // Two adjacent bands: 0–2 and 2–4, so the gap sits exactly at time 2.
  const cols = [
    { from: 0, to: 2 },
    { from: 2, to: 4 },
  ];

  it("is a plain scale when there is no gap", () => {
    expect(timeToX(3, cols, 100, 0)).toBe(300);
  });

  it("shifts everything past a column by one gap", () => {
    expect(timeToX(1, cols, 100, 40)).toBe(100);
    expect(timeToX(2, cols, 100, 40)).toBe(240);
    expect(timeToX(5, cols, 100, 40)).toBe(580);
  });

  it("puts a real gutter between two adjacent bands", () => {
    const firstBandRight = spanEndX(2, cols, 100, 40);
    const secondBandLeft = timeToX(2, cols, 100, 40);
    expect(secondBandLeft - firstBandRight).toBe(40);
  });

  it("does not let a right edge reach across the gutter it ends on", () => {
    expect(spanEndX(2, cols, 100, 40)).toBe(200);
    expect(timeToX(2, cols, 100, 40)).toBe(240);
  });

  it("round-trips through xToTime at every gutter level", () => {
    for (const t of [0, 1, 2, 3, 4, 5]) {
      expect(xToTime(timeToX(t, cols, 100, 40), cols, 100, 40)).toBeCloseTo(t);
    }
  });
});

describe("eventWidth", () => {
  const cols = [
    { from: 0, to: 2 },
    { from: 2, to: 4 },
  ];

  it("falls back to one node width without a span", () => {
    expect(eventWidth({ from: 1, to: undefined }, cols, 400, 0)).toBe(NODE_WIDTH);
    expect(eventWidth({ from: 1, to: 1 }, cols, 400, 0)).toBe(NODE_WIDTH);
  });

  it("stretches across the span", () => {
    expect(eventWidth({ from: 0, to: 2 }, cols, 400, 0)).toBe(800);
  });

  it("includes gutters the span crosses", () => {
    expect(eventWidth({ from: 0, to: 3 }, cols, 400, 40)).toBe(1240);
  });

  it("stops at the gutter when the span ends on a column boundary", () => {
    expect(eventWidth({ from: 0, to: 2 }, cols, 400, 40)).toBe(800);
  });

  it("never renders narrower than a node", () => {
    expect(eventWidth({ from: 0, to: 0.1 }, cols, 400, 0)).toBe(NODE_WIDTH);
  });
});

describe("eventBox", () => {
  const cols = [{ from: 0, to: 2 }];

  it("insets the span by NODE_MARGIN on each side", () => {
    const box = eventBox({ from: 0, to: 2 }, cols, 400, 0)!;
    expect(box.x).toBe(0 + NODE_MARGIN);
    expect(box.width).toBe(800 - 2 * NODE_MARGIN);
  });

  it("leaves equal room to both column edges", () => {
    const box = eventBox({ from: 0, to: 2 }, cols, 400, 0)!;
    const columnRight = spanEndX(2, cols, 400, 0);
    expect(box.x - timeToX(0, cols, 400, 0)).toBe(NODE_MARGIN);
    expect(columnRight - (box.x + box.width)).toBe(NODE_MARGIN);
  });

  it("is undefined for nodes with no time position", () => {
    expect(eventBox({ from: undefined, to: undefined }, cols, 400, 0)).toBeUndefined();
  });
});

describe("deriveSpan", () => {
  it("returns undefined bounds for a graph with no content nodes", () => {
    const graph: BlueprintGraph = { id: "g", nodes: [], edges: [] };
    expect(deriveSpan(graph)).toEqual({ from: undefined, to: undefined });
  });

  it("computes the min/max span across event and reroute nodes, ignoring tunnels", () => {
    const graph: BlueprintGraph = {
      id: "g",
      nodes: [
        event("a", 2, 3),
        event("b", 0, 1),
        {
          id: "entry",
          kind: "entry",
          title: "",
          description: "",
          status: "idee",
          x: -500,
          y: 0,
          outputs: [{ id: "out", label: "" }],
          pinId: "in",
        },
      ],
      edges: [],
    };
    expect(deriveSpan(graph)).toEqual({ from: 0, to: 3 });
  });
});

describe("syncTunnelExits", () => {
  const entry: BlueprintNode = {
    id: "entry",
    kind: "entry",
    title: "Eingang",
    description: "",
    status: "idee",
    x: 0,
    y: 0,
    outputs: [{ id: "out", label: "" }],
    pinId: "in",
  };

  it("seeds one exit node per output pin on an empty sub-graph", () => {
    const graph: BlueprintGraph = { id: "g", nodes: [entry], edges: [] };
    const synced = syncTunnelExits(graph, [{ id: "pin_a", label: "Begegnet Nele" }]);
    const exits = synced.nodes.filter((n) => n.kind === "exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].pinId).toBe("pin_a");
    expect(exits[0].title).toBe("Begegnet Nele");
  });

  it("renames an existing exit when its pin label changes", () => {
    const graph: BlueprintGraph = { id: "g", nodes: [entry], edges: [] };
    const seeded = syncTunnelExits(graph, [{ id: "pin_a", label: "Alt" }]);
    const renamed = syncTunnelExits(seeded, [{ id: "pin_a", label: "Neu" }]);
    const exits = renamed.nodes.filter((n) => n.kind === "exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].id).toBe(seeded.nodes.find((n) => n.kind === "exit")!.id);
    expect(exits[0].title).toBe("Neu");
  });

  it("drops a removed pin's exit node and any edge pointing at it", () => {
    const graph: BlueprintGraph = { id: "g", nodes: [entry], edges: [] };
    const seeded = syncTunnelExits(graph, [{ id: "pin_a", label: "A" }]);
    const exitId = seeded.nodes.find((n) => n.kind === "exit")!.id;
    const withEdge: BlueprintGraph = {
      ...seeded,
      edges: [{ id: "e1", source: "entry", sourcePin: "out", target: exitId }],
    };
    const synced = syncTunnelExits(withEdge, []);
    expect(synced.nodes.some((n) => n.kind === "exit")).toBe(false);
    expect(synced.edges).toHaveLength(0);
  });
});
