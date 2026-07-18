import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ArcData,
  Arc,
  ArcPoint,
  ArcLink,
  Timeline,
  ArcCoverage,
} from "../../src/shared/types.js";

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
 * Timeline lives in timeline.json; arcs/points/links in arcs.json.
 * Missing files yield empty data (not an error), so a fresh project just opens
 * to a blank, editable timeline.
 *
 * Backward compatibility: arc points were formerly called "beats" and could
 * carry a `sceneRef`. Legacy files are read transparently — `beats` maps to
 * `points` and the obsolete `sceneRef` is dropped — and rewritten on next save.
 */
export async function readArcs(projectRoot: string | null): Promise<ArcData> {
  const root = ensureProjectRoot(projectRoot);

  const timeline = await readJsonFile<Timeline>(
    getTimelineFilePath(root),
    DEFAULT_TIMELINE,
  );
  const body = await readJsonFile<{
    arcs?: Arc[];
    points?: ArcPoint[];
    beats?: Array<ArcPoint & { sceneRef?: string }>;
    links?: ArcLink[];
  }>(getArcsFilePath(root), {});

  const rawPoints = body.points ?? body.beats ?? [];
  const points: ArcPoint[] = rawPoints.map(({ id, arcId, at, title, note }) => ({
    id,
    arcId,
    at,
    title,
    ...(note != null ? { note } : {}),
  }));

  return {
    timeline: { ...DEFAULT_TIMELINE, ...timeline },
    arcs: [...(body.arcs ?? [])].sort((a, b) => a.order - b.order),
    points,
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
      { arcs: data.arcs, points: data.points, links: data.links },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { status: "ok" };
}

// ── Coverage ───────────────────────────────────────────────────────────
// "Which parts of the plan are realized by the book?" — computed by scanning
// structure metadata for references back to the arc workspace. The arc side
// never stores this; it is always derived, so it can never drift.

/** Matches @[Titel](arc:ID) / @[Titel](arcpoint:ID) mentions in meta values. */
const ARC_MENTION_RE = /@\[[^\]]*\]\((arc|arcpoint):([^)]+)\)/g;

/**
 * Collect arc/point references from any JSON value, recursing through objects and
 * arrays and scanning every string. Works regardless of where the mention sits —
 * top-level `extras` in a legacy sidecar, or nested per-node extras inside the
 * consolidated `structure.json` manifest.
 */
function collectRefs(
  raw: unknown,
  acc: { arcs: Set<string>; points: Set<string> },
): void {
  if (typeof raw === "string") {
    ARC_MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ARC_MENTION_RE.exec(raw)) !== null) {
      const id = m[2].trim();
      if (!id) continue;
      (m[1] === "arc" ? acc.arcs : acc.points).add(id);
    }
    return;
  }
  if (Array.isArray(raw)) {
    for (const value of raw) collectRefs(value, acc);
    return;
  }
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      collectRefs(value, acc);
    }
  }
}

/** Recursively scan a `.project` tree, collecting refs from every *.json file. */
async function scanMetaTree(
  dir: string,
  acc: { arcs: Set<string>; points: Set<string> },
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir — nothing to scan
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanMetaTree(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        collectRefs(JSON.parse(await fs.readFile(full, "utf8")), acc);
      } catch {
        // unreadable / non-meta json — skip
      }
    }
  }
}

/** Project root plus one level of subproject folders (book bases). */
async function listStructureBases(projectRoot: string): Promise<string[]> {
  const bases = [projectRoot];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(projectRoot, { withFileTypes: true });
  } catch {
    return bases;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const abs = path.join(projectRoot, entry.name);
    const isSubproject =
      (await fs.access(path.join(abs, ".subproject.json")).then(() => true, () => false)) ||
      (await fs.access(path.join(abs, ".project")).then(() => true, () => false));
    if (isSubproject) bases.push(abs);
  }
  return bases;
}

/**
 * Compute arc coverage across the whole workspace (root project + subprojects).
 * Scans every `.project` metadata file for `arc:`/`arcpoint:` mentions and
 * returns the set of referenced ids. Ids not returned are unrealized.
 */
export async function computeArcCoverage(
  projectRoot: string | null,
): Promise<ArcCoverage> {
  const root = ensureProjectRoot(projectRoot);
  const acc = { arcs: new Set<string>(), points: new Set<string>() };
  for (const base of await listStructureBases(root)) {
    await scanMetaTree(path.join(base, ".project"), acc);
  }
  return { arcs: [...acc.arcs], points: [...acc.points] };
}
