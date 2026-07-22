import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { BlueprintData, BlueprintGraph } from "../../src/shared/types.js";

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return projectRoot;
}

function getBlueprintDir(projectRoot: string): string {
  return path.join(projectRoot, ".assistant", "blueprint");
}

function getGraphFilePath(projectRoot: string): string {
  return path.join(getBlueprintDir(projectRoot), "graph.json");
}

function newGraphId(): string {
  return `graph_${crypto.randomUUID().slice(0, 8)}`;
}

/** A fresh document: one empty root graph. */
function emptyBlueprint(): BlueprintData {
  const rootGraphId = newGraphId();
  return {
    rootGraphId,
    graphs: { [rootGraphId]: { id: rootGraphId, nodes: [], edges: [] } },
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    // Missing or malformed file — treat as empty.
    return fallback;
  }
}

/**
 * Every graph reachable from the root by walking container nodes' `subGraphId`.
 * Iterative with a seen-set, so a document that somehow became cyclic (a graph
 * containing a node that points back at an ancestor) can't hang the sweep, and
 * a `subGraphId` pointing at a graph that no longer exists is simply ignored.
 */
function reachableGraphIds(
  graphs: Record<string, BlueprintGraph>,
  rootGraphId: string,
): Set<string> {
  const seen = new Set<string>();
  const pending = [rootGraphId];
  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (seen.has(id)) continue;
    const graph = graphs[id];
    if (!graph) continue;
    seen.add(id);
    for (const node of graph.nodes) {
      if (node.subGraphId) pending.push(node.subGraphId);
    }
  }
  return seen;
}

/**
 * Drop every graph no container node points at any more. Deleting a node in the
 * renderer only removes it from the live canvas — its sub-graph, and everything
 * nested below that, would otherwise stay in the document forever. Sweeping
 * from the root on both read and write keeps that from accumulating and heals
 * documents that already collected orphans, without the renderer having to
 * remember to clean up at each of its delete paths.
 */
function pruneOrphanGraphs(data: BlueprintData): {
  data: BlueprintData;
  dropped: string[];
} {
  const reachable = reachableGraphIds(data.graphs, data.rootGraphId);
  const dropped = Object.keys(data.graphs).filter((id) => !reachable.has(id));
  if (dropped.length === 0) return { data, dropped };
  const graphs: Record<string, BlueprintGraph> = {};
  for (const id of reachable) graphs[id] = data.graphs[id];
  return { data: { ...data, graphs }, dropped };
}

/** Normalize a possibly-partial document so the renderer always gets a valid,
 * non-empty store with an existing root graph. */
function normalize(data: Partial<BlueprintData>): BlueprintData {
  const graphs = data.graphs ?? {};
  const hasRoot =
    typeof data.rootGraphId === "string" && !!graphs[data.rootGraphId];
  if (!hasRoot || Object.keys(graphs).length === 0) {
    return emptyBlueprint();
  }
  const cleaned: Record<string, BlueprintGraph> = {};
  for (const [id, graph] of Object.entries(graphs)) {
    cleaned[id] = {
      id: graph.id ?? id,
      nodes: graph.nodes ?? [],
      edges: graph.edges ?? [],
      columns: graph.columns ?? [],
    };
  }
  return pruneOrphanGraphs({
    ...data,
    rootGraphId: data.rootGraphId as string,
    graphs: cleaned,
  }).data;
}

/**
 * Read the Blueprint world-chronology graph. A missing file yields a fresh
 * document with a single empty root graph (never an error), so a new project
 * opens to a blank, editable canvas.
 */
export async function readBlueprint(
  projectRoot: string | null,
): Promise<BlueprintData> {
  const root = ensureProjectRoot(projectRoot);
  const data = await readJsonFile<Partial<BlueprintData>>(
    getGraphFilePath(root),
    {},
  );
  return normalize(data);
}

/** Persist the full Blueprint document to a single graph.json. */
export async function writeBlueprint(
  projectRoot: string | null,
  data: BlueprintData,
): Promise<{ status: string }> {
  const root = ensureProjectRoot(projectRoot);
  const { data: swept, dropped } = pruneOrphanGraphs(data);
  if (dropped.length > 0) {
    console.warn(
      `[blueprint] removed ${dropped.length} orphaned sub-graph(s): ${dropped.join(", ")}`,
    );
  }
  await fs.mkdir(getBlueprintDir(root), { recursive: true });
  await fs.writeFile(
    getGraphFilePath(root),
    `${JSON.stringify({ rootGraphId: swept.rootGraphId, graphs: swept.graphs }, null, 2)}\n`,
    "utf8",
  );
  return { status: "ok" };
}
