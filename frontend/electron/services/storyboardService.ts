import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoryboardData } from "../../src/shared/types.js";

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return projectRoot;
}

function getStoryboardDir(projectRoot: string): string {
  return path.join(projectRoot, ".assistant", "storyboard");
}

function getBoardFilePath(projectRoot: string): string {
  return path.join(getStoryboardDir(projectRoot), "board.json");
}

const EMPTY_BOARD: StoryboardData = { cards: [], frames: [] };

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
 * Read the pinboard workspace. A missing file yields an empty board (not an
 * error), so a fresh project opens to a blank, editable canvas.
 */
export async function readStoryboard(
  projectRoot: string | null,
): Promise<StoryboardData> {
  const root = ensureProjectRoot(projectRoot);
  const data = await readJsonFile<Partial<StoryboardData>>(
    getBoardFilePath(root),
    EMPTY_BOARD,
  );
  return {
    cards: data.cards ?? [],
    frames: data.frames ?? [],
  };
}

/** Persist the full pinboard workspace to a single board.json. */
export async function writeStoryboard(
  projectRoot: string | null,
  data: StoryboardData,
): Promise<{ status: string }> {
  const root = ensureProjectRoot(projectRoot);
  await fs.mkdir(getStoryboardDir(root), { recursive: true });
  await fs.writeFile(
    getBoardFilePath(root),
    `${JSON.stringify({ cards: data.cards, frames: data.frames }, null, 2)}\n`,
    "utf8",
  );
  return { status: "ok" };
}
