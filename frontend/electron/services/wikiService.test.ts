import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWikiIndex,
  createAttachedNote,
  formatWikiIndex,
  getAttachedNote,
} from "./wikiService.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-attached-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeWiki(rel: string, content: string): Promise<void> {
  const abs = path.join(root, "wiki", rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

describe("attached notes", () => {
  it("parses attachedTo frontmatter into the index and annotates the format", async () => {
    await writeWiki(
      "kapitel/die-ankunft.md",
      ["---", "title: Die Ankunft", "summary: Anna kommt an", "attachedTo: chapter:c1", "---", "# Die Ankunft"].join("\n"),
    );

    const entries = await buildWikiIndex(root);
    const entry = entries.find((e) => e.name === "Die Ankunft");
    expect(entry?.attachedTo).toBe("chapter:c1");

    const formatted = formatWikiIndex(entries);
    expect(formatted).toContain("[↳ chapter:c1]");
  });

  it("resolves a node to its attached note", async () => {
    await writeWiki(
      "szene/wald.md",
      ["---", "title: Waldszene", "attachedTo: scene:c1:s1", "---", "# Waldszene"].join("\n"),
    );

    const note = await getAttachedNote(root, "scene:c1:s1");
    expect(note?.path).toBe("wiki/szene/wald.md");
    expect(await getAttachedNote(root, "scene:c1:s2")).toBeNull();
  });

  it("creates a metafile with attachedTo frontmatter, then finds it", async () => {
    const { path: notePath } = await createAttachedNote(root, "chapter:c9", "Kapitel Neun");
    expect(notePath).toBe("wiki/kapitel/kapitel-neun.md");

    const raw = await fs.readFile(path.join(root, "wiki/kapitel/kapitel-neun.md"), "utf8");
    expect(raw).toContain("attachedTo: chapter:c9");

    const note = await getAttachedNote(root, "chapter:c9");
    expect(note?.path).toBe(notePath);
  });

  it("is idempotent: returns the existing note instead of duplicating", async () => {
    const first = await createAttachedNote(root, "arc:a1", "Hauptbogen");
    const second = await createAttachedNote(root, "arc:a1", "Hauptbogen (nochmal)");
    expect(second.path).toBe(first.path);
  });
});
