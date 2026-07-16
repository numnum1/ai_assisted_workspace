import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAction,
  createChapter,
  createScene,
  deleteScene,
  getBookMeta,
  getChapterStructure,
  listChapters,
  randomizeIds,
  readActionContent,
  reorderChapters,
  updateBookMeta,
  updateSceneMeta,
  writeActionContent,
} from "./chapterService.js";
import { readManifestFile } from "./chapterManifest.js";

let root: string;
const WR = null; // default workspace root (main project)

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "chapterservice-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("chapter/scene/action lifecycle", () => {
  it("creates and lists chapters with position-derived sortOrder", async () => {
    const a = await createChapter(root, "Erstes", WR);
    const b = await createChapter(root, "Zweites", WR);

    const list = await listChapters(root, WR);
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list.map((c) => c.meta.sortOrder)).toEqual([0, 1]);
    expect(list[1]!.meta.title).toBe("Zweites");
  });

  it("createScene adds a default action plus its empty prose file", async () => {
    const ch = await createChapter(root, "K", WR);
    const scene = await createScene(root, ch.id, "Szene A", WR);

    expect(scene.actions).toHaveLength(1);
    const structure = await getChapterStructure(root, ch.id, WR);
    expect(structure.scenes).toHaveLength(1);
    expect(structure.scenes[0]!.actions).toHaveLength(1);

    const actionId = scene.actions[0]!.id;
    const md = path.join(root, ".project/chapter", ch.id, scene.id, `${actionId}.md`);
    expect(await fs.readFile(md, "utf8")).toBe("");
  });

  it("persists description and typed extras via updateSceneMeta", async () => {
    const ch = await createChapter(root, "K", WR);
    const scene = await createScene(root, ch.id, "Szene", WR);

    await updateSceneMeta(
      root,
      ch.id,
      scene.id,
      { title: "Szene", description: "Der Held flieht.", sortOrder: 0, extras: { location: "Wald" } },
      WR,
    );

    const structure = await getChapterStructure(root, ch.id, WR);
    expect(structure.scenes[0]!.meta.description).toBe("Der Held flieht.");
    expect(structure.scenes[0]!.meta.extras).toEqual({ location: "Wald" });
  });

  it("round-trips prose content", async () => {
    const ch = await createChapter(root, "K", WR);
    const scene = await createScene(root, ch.id, "S", WR);
    const action = await createAction(root, ch.id, scene.id, "Zweiter Teil", WR);

    await writeActionContent(root, ch.id, scene.id, action.id, "Hallo Welt", WR);
    expect(await readActionContent(root, ch.id, scene.id, action.id, WR)).toBe("Hallo Welt");
  });

  it("deleteScene removes it from the manifest and deletes its content dir", async () => {
    const ch = await createChapter(root, "K", WR);
    const scene = await createScene(root, ch.id, "S", WR);
    const sceneDir = path.join(root, ".project/chapter", ch.id, scene.id);
    expect(await fs.stat(sceneDir).then(() => true)).toBe(true);

    await deleteScene(root, ch.id, scene.id, WR);
    const structure = await getChapterStructure(root, ch.id, WR);
    expect(structure.scenes).toHaveLength(0);
    await expect(fs.stat(sceneDir)).rejects.toThrow();
  });
});

describe("ordering", () => {
  it("reorderChapters changes the persisted order", async () => {
    const a = await createChapter(root, "A", WR);
    const b = await createChapter(root, "B", WR);
    const c = await createChapter(root, "C", WR);

    await reorderChapters(root, [c.id, a.id, b.id], WR);
    const list = await listChapters(root, WR);
    expect(list.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
    expect(list.map((x) => x.meta.sortOrder)).toEqual([0, 1, 2]);
  });
});

describe("book meta", () => {
  it("round-trips book synopsis through extras", async () => {
    await updateBookMeta(
      root,
      { title: "Mein Buch", description: "kurz", sortOrder: 0, extras: { synopsis: "die Story" } },
      WR,
    );
    const meta = await getBookMeta(root, WR);
    expect(meta.title).toBe("Mein Buch");
    expect(meta.extras).toEqual({ synopsis: "die Story" });
  });
});

describe("randomizeIds", () => {
  it("regenerates ids while preserving prose content", async () => {
    const ch = await createChapter(root, "K", WR);
    const scene = await createScene(root, ch.id, "S", WR);
    const actionId = scene.actions[0]!.id;
    await writeActionContent(root, ch.id, scene.id, actionId, "Bewahrter Text", WR);

    const result = await randomizeIds(root, WR);
    expect(result.renamed).toBeGreaterThan(0);

    const manifest = await readManifestFile(root);
    const newChapter = manifest!.chapters[0]!;
    expect(newChapter.id).not.toBe(ch.id);
    const newScene = newChapter.scenes[0]!;
    const newAction = newScene.actions[0]!;

    const content = await readActionContent(root, newChapter.id, newScene.id, newAction.id, WR);
    expect(content).toBe("Bewahrter Text");
    // Old content dir is gone.
    await expect(fs.stat(path.join(root, ".project/chapter", ch.id))).rejects.toThrow();
  });
});
