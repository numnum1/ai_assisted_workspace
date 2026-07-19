import { describe, expect, it } from "vitest";
import { assignLanes, deriveSpan, syncTunnelExits } from "./layout.ts";
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
  it("keeps non-overlapping nodes on the same lane", () => {
    const lanes = assignLanes([event("a", 0, 1), event("b", 1, 2)]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
  });

  it("separates overlapping nodes into different lanes", () => {
    const lanes = assignLanes([event("a", 0, 2), event("b", 1, 3)]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
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
