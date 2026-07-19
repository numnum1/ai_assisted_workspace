import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readStoryboard, writeStoryboard } from "./storyboardService.js";
import type { StoryboardData } from "../../src/shared/types.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "storyboard-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("storyboardService", () => {
  it("returns an empty board when no file exists yet", async () => {
    const data = await readStoryboard(root);
    expect(data).toEqual({ cards: [], frames: [], edges: [] });
  });

  it("round-trips cards, frames and edges through write then read", async () => {
    const board: StoryboardData = {
      cards: [
        {
          id: "card_1",
          title: "Idee",
          note: "was-wäre-wenn",
          x: 10,
          y: 20,
          tags: ["Wendepunkt"],
          bookPaths: ["buch-2"],
          status: "idea",
        },
      ],
      frames: [
        { id: "frame_1", title: "Akt 2", x: 0, y: 0, w: 320, h: 260 },
      ],
      edges: [
        { id: "edge_1", a: "card_1", b: "card_2", label: "hängt zusammen" },
      ],
    };

    await writeStoryboard(root, board);
    const roundTripped = await readStoryboard(root);
    expect(roundTripped).toEqual(board);
  });

  it("backfills edges when reading a legacy board file without them", async () => {
    const file = path.join(root, ".assistant", "storyboard", "board.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ cards: [], frames: [] }), "utf8");

    const data = await readStoryboard(root);
    expect(data).toEqual({ cards: [], frames: [], edges: [] });
  });

  it("tolerates a malformed board file by falling back to empty", async () => {
    const file = path.join(root, ".assistant", "storyboard", "board.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ not json", "utf8");

    const data = await readStoryboard(root);
    expect(data).toEqual({ cards: [], frames: [], edges: [] });
  });

  it("throws when no project is open", async () => {
    await expect(readStoryboard(null)).rejects.toThrow(
      "No project is currently open.",
    );
  });
});
