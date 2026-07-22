import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBlueprint, writeBlueprint } from "./blueprintService.js";
import type { BlueprintData, BlueprintNode } from "../../src/shared/types.js";

function eventNode(id: string, patch: Partial<BlueprintNode> = {}): BlueprintNode {
  return {
    id,
    kind: "event",
    title: id,
    description: "",
    status: "idee",
    x: 0,
    y: 0,
    outputs: [],
    ...patch,
  };
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "blueprint-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("blueprintService", () => {
  it("returns a fresh doc with one empty root graph when no file exists", async () => {
    const data = await readBlueprint(root);
    expect(typeof data.rootGraphId).toBe("string");
    expect(data.graphs[data.rootGraphId]).toBeDefined();
    expect(data.graphs[data.rootGraphId].nodes).toEqual([]);
    expect(data.graphs[data.rootGraphId].edges).toEqual([]);
  });

  it("round-trips a nested (multi-level) graph store through write then read", async () => {
    const doc: BlueprintData = {
      rootGraphId: "graph_root",
      graphs: {
        graph_root: {
          id: "graph_root",
          nodes: [
            {
              id: "node_1",
              kind: "event",
              title: "Ankunft im Hafen",
              description: "Der Charakter kommt an Land.",
              status: "kanon",
              x: 40,
              y: 60,
              from: 0,
              to: 1,
              outputs: [{ id: "pin_a", label: "Begegnet Nele" }],
              subGraphId: "graph_child",
            },
          ],
          edges: [],
          columns: [
            { id: "col_1", label: "Tag 1 Hafen", order: 0, from: 0, to: 1 },
          ],
        },
        graph_child: {
          id: "graph_child",
          nodes: [
            {
              id: "node_entry",
              kind: "entry",
              title: "Eingang",
              description: "",
              status: "idee",
              x: 0,
              y: 0,
              outputs: [{ id: "pin_in", label: "in" }],
            },
          ],
          edges: [],
          columns: [],
        },
      },
    };

    await writeBlueprint(root, doc);
    const roundTripped = await readBlueprint(root);
    expect(roundTripped).toEqual(doc);
  });

  it("falls back to a fresh doc when the file is malformed", async () => {
    const file = path.join(root, ".assistant", "blueprint", "graph.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ not json", "utf8");

    const data = await readBlueprint(root);
    expect(data.graphs[data.rootGraphId]).toBeDefined();
    expect(data.graphs[data.rootGraphId].nodes).toEqual([]);
  });

  it("falls back to a fresh doc when rootGraphId points at a missing graph", async () => {
    const file = path.join(root, ".assistant", "blueprint", "graph.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ rootGraphId: "ghost", graphs: {} }),
      "utf8",
    );

    const data = await readBlueprint(root);
    expect(data.graphs[data.rootGraphId]).toBeDefined();
  });

  it("drops a sub-graph whose container node was deleted, recursively", async () => {
    const file = path.join(root, ".assistant", "blueprint", "graph.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        rootGraphId: "graph_root",
        graphs: {
          graph_root: {
            id: "graph_root",
            nodes: [eventNode("node_kept", { subGraphId: "graph_kept" })],
            edges: [],
          },
          graph_kept: { id: "graph_kept", nodes: [], edges: [] },
          // Orphaned: nothing points at graph_a any more, and the node it
          // still contains owns a sub-graph of its own.
          graph_a: {
            id: "graph_a",
            nodes: [eventNode("node_inner", { subGraphId: "graph_b" })],
            edges: [],
          },
          graph_b: { id: "graph_b", nodes: [], edges: [] },
        },
      }),
      "utf8",
    );

    const data = await readBlueprint(root);
    expect(Object.keys(data.graphs).sort()).toEqual(["graph_kept", "graph_root"]);
  });

  it("keeps sub-graphs nested several levels deep", async () => {
    const doc: BlueprintData = {
      rootGraphId: "graph_root",
      graphs: {
        graph_root: {
          id: "graph_root",
          nodes: [eventNode("node_1", { subGraphId: "graph_l1" })],
          edges: [],
          columns: [],
        },
        graph_l1: {
          id: "graph_l1",
          nodes: [eventNode("node_2", { subGraphId: "graph_l2" })],
          edges: [],
          columns: [],
        },
        graph_l2: { id: "graph_l2", nodes: [], edges: [], columns: [] },
      },
    };

    await writeBlueprint(root, doc);
    expect(await readBlueprint(root)).toEqual(doc);
  });

  it("does not hang on a sub-graph cycle", async () => {
    const file = path.join(root, ".assistant", "blueprint", "graph.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        rootGraphId: "graph_root",
        graphs: {
          graph_root: {
            id: "graph_root",
            nodes: [eventNode("node_1", { subGraphId: "graph_a" })],
            edges: [],
          },
          graph_a: {
            id: "graph_a",
            nodes: [eventNode("node_2", { subGraphId: "graph_root" })],
            edges: [],
          },
        },
      }),
      "utf8",
    );

    const data = await readBlueprint(root);
    expect(Object.keys(data.graphs).sort()).toEqual(["graph_a", "graph_root"]);
  });

  it("ignores a subGraphId pointing at a graph that no longer exists", async () => {
    const file = path.join(root, ".assistant", "blueprint", "graph.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        rootGraphId: "graph_root",
        graphs: {
          graph_root: {
            id: "graph_root",
            nodes: [eventNode("node_1", { subGraphId: "graph_ghost" })],
            edges: [],
          },
        },
      }),
      "utf8",
    );

    const data = await readBlueprint(root);
    expect(Object.keys(data.graphs)).toEqual(["graph_root"]);
  });

  it("throws when no project is open", async () => {
    await expect(readBlueprint(null)).rejects.toThrow(
      "No project is currently open.",
    );
  });
});
