import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadManifest,
  migrateSidecarsToManifest,
  readManifestFile,
  reorderById,
  writeManifest,
} from "./chapterManifest.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeJson(rel: string, data: unknown): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(data, null, 2), "utf8");
}

describe("migrateSidecarsToManifest", () => {
  it("returns null when there is nothing to migrate", async () => {
    expect(await migrateSidecarsToManifest(root)).toBeNull();
  });

  it("converts the legacy sidecar tree, ordering by sortOrder", async () => {
    // Two chapters, deliberately written out of order; sortOrder decides.
    await writeJson(".project/chapter/c-b.json", { title: "Zweites", description: "B", sortOrder: 1 });
    await writeJson(".project/chapter/c-a.json", { title: "Erstes", description: "A", sortOrder: 0 });
    // Scene with extras + one action, under chapter c-a.
    await writeJson(".project/chapter/c-a/s1.json", {
      title: "Szene 1",
      description: "Auftakt",
      sortOrder: 0,
      extras: { location: "Wald", goal: "Fliehen" },
    });
    await writeJson(".project/chapter/c-a/s1/a1.json", { title: "Inhalt", description: "", sortOrder: 0 });
    await fs.writeFile(path.join(root, ".project/chapter/c-a/s1/a1.md"), "Es war einmal.", "utf8");

    const manifest = await migrateSidecarsToManifest(root);
    expect(manifest).not.toBeNull();
    expect(manifest!.chapters.map((c) => c.id)).toEqual(["c-a", "c-b"]);
    const first = manifest!.chapters[0]!;
    expect(first.title).toBe("Erstes");
    expect(first.scenes[0]!.extras).toEqual({ location: "Wald", goal: "Fliehen" });
    expect(first.scenes[0]!.actions[0]!.id).toBe("a1");
    // sortOrder must not leak into the manifest nodes.
    expect("sortOrder" in first).toBe(false);
  });

  it("ignores chapter comment sidecars (never a phantom chapter)", async () => {
    await writeJson(".project/chapter/c1.json", { title: "K1", description: "", sortOrder: 0 });
    await writeJson(".project/chapter/c1.comments.json", { version: 1, comments: [] });

    const manifest = await migrateSidecarsToManifest(root);
    expect(manifest!.chapters.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("loadManifest", () => {
  it("persists the migration exactly once, then reads the file", async () => {
    await writeJson(".project/chapter/c1.json", { title: "K1", description: "", sortOrder: 0 });

    expect(await readManifestFile(root)).toBeNull();
    const loaded = await loadManifest(root);
    expect(loaded.chapters).toHaveLength(1);
    // structure.json now exists on disk.
    const onDisk = await readManifestFile(root);
    expect(onDisk).not.toBeNull();
    expect(onDisk!.chapters[0]!.id).toBe("c1");
  });

  it("does not write a manifest for an empty project", async () => {
    await loadManifest(root);
    expect(await readManifestFile(root)).toBeNull();
  });
});

describe("writeManifest", () => {
  it("round-trips atomically without leaving temp files", async () => {
    await writeManifest(root, {
      version: 1,
      chapters: [{ id: "c1", title: "K", description: "", scenes: [] }],
    });
    const back = await readManifestFile(root);
    expect(back!.chapters[0]!.id).toBe("c1");
    const dirEntries = await fs.readdir(path.join(root, ".project"));
    expect(dirEntries.some((n) => n.includes(".tmp-"))).toBe(false);
  });
});

describe("reorderById", () => {
  it("reorders by id and appends unknown ids at the end", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reorderById(items, ["c", "a"]).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(reorderById(items, ["x", "b"]).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
