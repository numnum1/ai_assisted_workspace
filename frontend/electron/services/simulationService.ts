import * as fs from "fs/promises";
import * as path from "path";

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
