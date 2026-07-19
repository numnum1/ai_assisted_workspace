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
  return { rootGraphId: data.rootGraphId as string, graphs: cleaned };
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
  await fs.mkdir(getBlueprintDir(root), { recursive: true });
  await fs.writeFile(
    getGraphFilePath(root),
    `${JSON.stringify({ rootGraphId: data.rootGraphId, graphs: data.graphs }, null, 2)}\n`,
    "utf8",
  );
  return { status: "ok" };
}
