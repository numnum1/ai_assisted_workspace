import * as fs from "fs/promises";
import * as path from "path";
import type { SimulationCharacter } from "../../src/types.js";

const SIMULATIONS_DIR = ".assistant/simulations";

function getSimulationsDir(projectRoot: string | null): string {
  if (!projectRoot) throw new Error("No project open");
  return path.join(projectRoot, SIMULATIONS_DIR);
}

function resolveResultPath(projectRoot: string | null, name: string): string {
  const dir = getSimulationsDir(projectRoot);
  const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 80);
  return path.join(dir, `${safeName}.md`);
}

export async function ensureSimulationsDir(
  projectRoot: string | null,
): Promise<void> {
  const dir = getSimulationsDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeSimulationResult(
  projectRoot: string | null,
  name: string,
  content: string,
): Promise<{ path: string }> {
  await ensureSimulationsDir(projectRoot);
  const filePath = resolveResultPath(projectRoot, name);
  await fs.writeFile(filePath, content, "utf8");
  return { path: path.relative(projectRoot ?? "", filePath) };
}

export async function readSimulationResult(
  projectRoot: string | null,
  name: string,
): Promise<{ content: string; exists: boolean }> {
  const filePath = resolveResultPath(projectRoot, name);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { content, exists: true };
  } catch {
    return { content: "", exists: false };
  }
}

export interface SimulationBookEntry {
  /** Relative path to the subproject folder, or null for the root project */
  structureRoot: string | null;
  /** Human-readable label (book title or folder name) */
  label: string;
  /** Characters pre-extracted from extras.Charactere */
  characters: SimulationCharacter[];
}

interface NodeMetaShape {
  title?: string;
  description?: string;
  extras?: Record<string, string>;
}

function parseMentionString(raw: string): SimulationCharacter[] {
  const chars: SimulationCharacter[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].trim();
    const wikiPath = m[2].trim();
    if (name && wikiPath) chars.push({ wikiPath, name });
  }
  return chars;
}

async function readNodeMeta(filePath: string): Promise<NodeMetaShape | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as NodeMetaShape;
  } catch {
    return null;
  }
}

async function readBookEntry(
  projectRoot: string,
  structureRoot: string | null,
  folderName: string | null,
): Promise<SimulationBookEntry | null> {
  const base = structureRoot ? path.join(projectRoot, structureRoot) : projectRoot;
  const bookMetaPath = path.join(base, ".project", "book.json");
  const meta = await readNodeMeta(bookMetaPath);

  const title = meta?.title?.trim() || null;
  const rawChars = meta?.extras?.["Charactere"] ?? meta?.extras?.["characters"] ?? "";
  const characters = typeof rawChars === "string" ? parseMentionString(rawChars) : [];

  const fallbackLabel = folderName ?? "Projekt-Root";
  const label = title ? `${title} (${fallbackLabel})` : fallbackLabel;

  return { structureRoot, label, characters };
}

export async function listSimulationBooks(
  projectRoot: string | null,
): Promise<SimulationBookEntry[]> {
  if (!projectRoot) throw new Error("No project open");

  const results: SimulationBookEntry[] = [];

  // Always include root project
  const root = await readBookEntry(projectRoot, null, "Root");
  if (root) results.push(root);

  // Scan one level for subprojects (directories with .subproject.json or .project/)
  let entries: string[];
  try {
    entries = await fs.readdir(projectRoot);
  } catch {
    return results;
  }

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const abs = path.join(projectRoot, name);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) continue;
      // Check for subproject marker
      const hasSubproject = await fs
        .access(path.join(abs, ".subproject.json"))
        .then(() => true)
        .catch(() => false);
      const hasProject = await fs
        .access(path.join(abs, ".project"))
        .then(() => true)
        .catch(() => false);
      if (hasSubproject || hasProject) {
        const entry = await readBookEntry(projectRoot, name, name);
        if (entry) results.push(entry);
      }
    } catch {
      continue;
    }
  }

  return results;
}

export async function listSimulationResults(
  projectRoot: string | null,
): Promise<string[]> {
  const dir = getSimulationsDir(projectRoot);
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith(".md"));
  } catch {
    return [];
  }
}
