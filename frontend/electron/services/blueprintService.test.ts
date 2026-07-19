import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBlueprint, writeBlueprint } from "./blueprintService.js";
import type { BlueprintData } from "../../src/shared/types.js";

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

  it("throws when no project is open", async () => {
    await expect(readBlueprint(null)).rejects.toThrow(
      "No project is currently open.",
    );
  });
});
