import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NodeMeta } from "../../src/shared/types.js";

/**
 * Single source of truth for a book's structure. Replaces the old scattered
 * sidecar tree (`.project/chapter/<id>.json`, `<id>/<sid>.json`, …): one ordered
 * file per structure root. Order is the array position (no `sortOrder` field);
 * identity stays the UUID `id`; prose stays in `<...>.md` files on disk, keyed by
 * those ids. See docs/buch-struktur-manifest.md.
 */

const CHAPTERS_DIR = ".project/chapter";
const MANIFEST_FILE = ".project/structure.json";

export interface ManifestNode {
  id: string;
  title: string;
  description: string;
  /** Typed structured fields (Ensemble/Arc read these). Kept as-is, never flattened. */
  extras?: Record<string, string>;
}

export type ManifestAction = ManifestNode;

export interface ManifestScene extends ManifestNode {
  actions: ManifestAction[];
}

export interface ManifestChapter extends ManifestNode {
  scenes: ManifestScene[];
}

/**
 * The chapter tree, ordered. Book-level meta deliberately stays in its own
 * `.project/book.json` (single file, clean API, also referenced directly for
 * drag-to-chat) — it was never part of the scattered-sidecar problem this
 * manifest solves.
 */
export interface BookManifest {
  version: 1;
  chapters: ManifestChapter[];
}

export function emptyManifest(): BookManifest {
  return { version: 1, chapters: [] };
}

export function generateId(): string {
  return randomUUID();
}

function getManifestPath(structureBase: string): string {
  return path.join(structureBase, MANIFEST_FILE);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeExtras(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeNode(raw: unknown): ManifestNode {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extras = normalizeExtras(o.extras);
  return {
    id: typeof o.id === "string" && o.id ? o.id : generateId(),
    title: typeof o.title === "string" ? o.title : "",
    description: typeof o.description === "string" ? o.description : "",
    ...(extras ? { extras } : {}),
  };
}

function normalizeAction(raw: unknown): ManifestAction {
  return normalizeNode(raw);
}

function normalizeScene(raw: unknown): ManifestScene {
  const base = normalizeNode(raw);
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const actions = Array.isArray(o.actions) ? o.actions.map(normalizeAction) : [];
  return { ...base, actions };
}

function normalizeChapter(raw: unknown): ManifestChapter {
  const base = normalizeNode(raw);
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const scenes = Array.isArray(o.scenes) ? o.scenes.map(normalizeScene) : [];
  return { ...base, scenes };
}

export function normalizeManifest(raw: unknown): BookManifest {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    version: 1,
    chapters: Array.isArray(o.chapters) ? o.chapters.map(normalizeChapter) : [],
  };
}

/** Read the manifest file, or null if it does not exist yet. */
export async function readManifestFile(
  structureBase: string,
): Promise<BookManifest | null> {
  const manifestPath = getManifestPath(structureBase);
  if (!(await pathExists(manifestPath))) return null;
  const raw = await fs.readFile(manifestPath, "utf8");
  return normalizeManifest(JSON.parse(raw) as unknown);
}

/** Atomically write the manifest (temp file + rename) so a crash can't corrupt it. */
export async function writeManifest(
  structureBase: string,
  manifest: BookManifest,
): Promise<void> {
  const manifestPath = getManifestPath(structureBase);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const tmpPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, manifestPath);
}

// --- One-time migration from the legacy sidecar tree --------------------------

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

/** Legacy NodeMeta sidecar → manifest node fields (drops sortOrder; caller orders). */
function sidecarToNodeFields(raw: unknown): { title: string; description: string; extras?: Record<string, string>; sortOrder: number } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extras = normalizeExtras(o.extras);
  return {
    title: typeof o.title === "string" ? o.title : "",
    description: typeof o.description === "string" ? o.description : "",
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
    ...(extras ? { extras } : {}),
  };
}

interface Ordered<T extends { id: string; title: string }> {
  sortOrder: number;
  node: T;
}

/** Order sidecar-derived nodes by legacy sortOrder, then natural title, then id. */
function bySortThenName<T extends { id: string; title: string }>(
  a: Ordered<T>,
  b: Ordered<T>,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const an = a.node;
  const bn = b.node;
  const byTitle = (an.title || an.id).localeCompare(bn.title || bn.id, "de", {
    numeric: true,
    sensitivity: "base",
  });
  if (byTitle !== 0) return byTitle;
  return an.id.localeCompare(bn.id, "de", { numeric: true, sensitivity: "base" });
}

function ordered<T extends { id: string; title: string }>(
  wrapped: Ordered<T>[],
): T[] {
  return wrapped.sort(bySortThenName).map((w) => w.node);
}

/**
 * Build a manifest from the legacy sidecar chapter tree. Returns null when there
 * are no chapters to migrate, so callers can avoid materializing an empty
 * structure.json for fresh projects. Book-level meta is untouched (stays in
 * .project/book.json).
 */
export async function migrateSidecarsToManifest(
  structureBase: string,
): Promise<BookManifest | null> {
  const chaptersRoot = path.join(structureBase, CHAPTERS_DIR);

  let chapterEntries: import("node:fs").Dirent[] = [];
  try {
    chapterEntries = await fs.readdir(chaptersRoot, { withFileTypes: true });
  } catch {
    chapterEntries = [];
  }

  const chapterJsons = chapterEntries.filter(
    (e) => e.isFile() && e.name.endsWith(".json") && !e.name.endsWith(".comments.json"),
  );

  if (chapterJsons.length === 0) {
    return null;
  }

  const chaptersWithOrder: Array<Ordered<ManifestChapter>> = [];

  for (const chapterEntry of chapterJsons) {
    const chapterId = stripExtension(chapterEntry.name);
    const chapterFields = sidecarToNodeFields(
      await readJson(path.join(chaptersRoot, chapterEntry.name)),
    );

    const chapterContentDir = path.join(chaptersRoot, chapterId);
    const scenesWithOrder: Array<Ordered<ManifestScene>> = [];

    let sceneEntries: import("node:fs").Dirent[] = [];
    try {
      sceneEntries = await fs.readdir(chapterContentDir, { withFileTypes: true });
    } catch {
      sceneEntries = [];
    }

    for (const sceneEntry of sceneEntries) {
      if (!sceneEntry.isFile() || !sceneEntry.name.endsWith(".json")) continue;
      const sceneId = stripExtension(sceneEntry.name);
      const sceneFields = sidecarToNodeFields(
        await readJson(path.join(chapterContentDir, sceneEntry.name)),
      );

      const sceneContentDir = path.join(chapterContentDir, sceneId);
      const actionsWithOrder: Array<Ordered<ManifestAction>> = [];

      let actionEntries: import("node:fs").Dirent[] = [];
      try {
        actionEntries = await fs.readdir(sceneContentDir, { withFileTypes: true });
      } catch {
        actionEntries = [];
      }

      for (const actionEntry of actionEntries) {
        if (!actionEntry.isFile() || !actionEntry.name.endsWith(".json")) continue;
        const actionId = stripExtension(actionEntry.name);
        const actionFields = sidecarToNodeFields(
          await readJson(path.join(sceneContentDir, actionEntry.name)),
        );
        actionsWithOrder.push({
          sortOrder: actionFields.sortOrder,
          node: {
            id: actionId,
            title: actionFields.title,
            description: actionFields.description,
            ...(actionFields.extras ? { extras: actionFields.extras } : {}),
          },
        });
      }

      scenesWithOrder.push({
        sortOrder: sceneFields.sortOrder,
        node: {
          id: sceneId,
          title: sceneFields.title,
          description: sceneFields.description,
          ...(sceneFields.extras ? { extras: sceneFields.extras } : {}),
          actions: ordered(actionsWithOrder),
        },
      });
    }

    chaptersWithOrder.push({
      sortOrder: chapterFields.sortOrder,
      node: {
        id: chapterId,
        title: chapterFields.title,
        description: chapterFields.description,
        ...(chapterFields.extras ? { extras: chapterFields.extras } : {}),
        scenes: ordered(scenesWithOrder),
      },
    });
  }

  return {
    version: 1,
    chapters: ordered(chaptersWithOrder),
  };
}

/**
 * Load the manifest for a structure root, migrating the legacy sidecar tree on
 * first access. The migrated manifest is persisted so the conversion happens
 * once; legacy sidecars are left in place (inert) as a safety net.
 */
export async function loadManifest(structureBase: string): Promise<BookManifest> {
  const existing = await readManifestFile(structureBase);
  if (existing) return existing;

  const migrated = await migrateSidecarsToManifest(structureBase);
  if (migrated) {
    await writeManifest(structureBase, migrated);
    return migrated;
  }
  return emptyManifest();
}

// --- Node → renderer NodeMeta -------------------------------------------------

/** Synthesize the legacy NodeMeta shape (incl. sortOrder from position) for the renderer. */
export function toNodeMeta(node: ManifestNode, index: number): NodeMeta {
  return {
    title: node.title,
    description: node.description,
    sortOrder: index,
    ...(node.extras ? { extras: node.extras } : {}),
  };
}

/** Apply an incoming NodeMeta onto a manifest node in place (position/order untouched). */
export function applyNodeMeta(node: ManifestNode, meta: NodeMeta): void {
  node.title = typeof meta.title === "string" ? meta.title : "";
  node.description = typeof meta.description === "string" ? meta.description : "";
  const extras = normalizeExtras(meta.extras);
  if (extras) node.extras = extras;
  else delete node.extras;
}

/** Reorder `items` so their ids follow `orderedIds`; unknown ids kept in place at the end. */
export function reorderById<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) {
      result.push(item);
      byId.delete(id);
    }
  }
  // Append any items not named in orderedIds, preserving their original order.
  for (const item of items) {
    if (byId.has(item.id)) result.push(item);
  }
  return result;
}
