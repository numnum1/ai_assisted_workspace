import { promises as fs } from "node:fs";
import path from "node:path";
import type { ArcData, Arc, Beat, ArcLink, Timeline } from "../../src/types.js";

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return projectRoot;
}

function getArcsDir(projectRoot: string): string {
  return path.join(projectRoot, ".assistant", "arcs");
}

function getTimelineFilePath(projectRoot: string): string {
  return path.join(getArcsDir(projectRoot), "timeline.json");
}

function getArcsFilePath(projectRoot: string): string {
  return path.join(getArcsDir(projectRoot), "arcs.json");
}

/** Empty-project default so the workspace opens to a usable, editable axis. */
const DEFAULT_TIMELINE: Timeline = {
  unit: "Tag",
  start: 0,
  end: 21,
  markers: [],
};

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
 * Read the arc workspace into a structured form for display.
 * Timeline lives in timeline.json; arcs/beats/links in arcs.json.
 * Missing files yield empty data (not an error), so a fresh project just opens
 * to a blank, editable timeline.
 */
export async function readArcs(projectRoot: string | null): Promise<ArcData> {
  const root = ensureProjectRoot(projectRoot);

  const timeline = await readJsonFile<Timeline>(
    getTimelineFilePath(root),
    DEFAULT_TIMELINE,
  );
  const body = await readJsonFile<{
    arcs: Arc[];
    beats: Beat[];
    links: ArcLink[];
  }>(getArcsFilePath(root), { arcs: [], beats: [], links: [] });

  return {
    timeline: { ...DEFAULT_TIMELINE, ...timeline },
    arcs: [...(body.arcs ?? [])].sort((a, b) => a.order - b.order),
    beats: body.beats ?? [],
    links: body.links ?? [],
  };
}

/**
 * Persist the full arc workspace. Splits across timeline.json and arcs.json so
 * the axis definition stays small and diffable separately from the content.
 */
export async function writeArcs(
  projectRoot: string | null,
  data: ArcData,
): Promise<{ status: string }> {
  const root = ensureProjectRoot(projectRoot);
  await fs.mkdir(getArcsDir(root), { recursive: true });

  await fs.writeFile(
    getTimelineFilePath(root),
    `${JSON.stringify(data.timeline, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    getArcsFilePath(root),
    `${JSON.stringify(
      { arcs: data.arcs, beats: data.beats, links: data.links },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { status: "ok" };
}
