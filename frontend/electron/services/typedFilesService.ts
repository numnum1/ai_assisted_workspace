import fs from "node:fs/promises";
import path from "node:path";

export interface TypedFileContentResult {
  path: string;
  data: Record<string, unknown>;
}

export interface TypedFileFillResult {
  data: Record<string, unknown>;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function splitRelativePath(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return [];
  return normalized.split("/").filter(Boolean);
}

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return path.resolve(projectRoot);
}

function resolveProjectPath(projectRoot: string | null, relativePath: string): string {
  const root = ensureProjectRoot(projectRoot);
  const resolved = path.resolve(root, ...splitRelativePath(relativePath));
  const relativeToRoot = path.relative(root, resolved);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }

  return resolved;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function ensureObjectRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid JSON in typed file ${filePath}: ${error.message}`
        : `Invalid JSON in typed file ${filePath}`,
    );
  }
}

function mergeMissingFields(target: Record<string, unknown>, source: Record<string, unknown>): boolean {
  let changed = false;

  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) {
      target[key] = structuredClone(value);
      changed = true;
      continue;
    }

    const current = target[key];
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      if (mergeMissingFields(current as Record<string, unknown>, value as Record<string, unknown>)) {
        changed = true;
      }
    }
  }

  return changed;
}

function collectStringCandidates(
  value: unknown,
  out: Array<{ path: string; value: string }>,
  currentPath = "",
): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      out.push({ path: currentPath || "root", value: trimmed });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectStringCandidates(item, out, `${currentPath}[${index}]`);
    });
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      collectStringCandidates(child, out, nextPath);
    }
  }
}

function buildPlaceholderFill(data: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(data) as Record<string, unknown>;
  const candidates: Array<{ path: string; value: string }> = [];
  collectStringCandidates(clone, candidates);

  if (candidates.length === 0) {
    return clone;
  }

  const titleCandidate =
    candidates.find((entry) => /title|titel|name/i.test(entry.path)) ??
    candidates[0];

  const summary =
    candidates
      .slice(0, 5)
      .map((entry) => `- ${entry.path}: ${entry.value}`)
      .join("\n") || "Keine bestehenden Textfelder erkannt.";

  if (!("aiSummary" in clone)) {
    clone.aiSummary = `Automatisch erzeugte lokale Vorbelegung zu "${titleCandidate.value}"`;
  }

  if (!("aiOutline" in clone)) {
    clone.aiOutline = summary;
  }

  return clone;
}

export async function getTypedFileContent(
  projectRoot: string | null,
  relativePath: string,
): Promise<TypedFileContentResult> {
  const filePath = resolveProjectPath(projectRoot, relativePath);

  if (!(await pathExists(filePath))) {
    return {
      path: normalizeRelativePath(relativePath),
      data: {},
    };
  }

  const raw = await readJsonFile(filePath);
  const parsed = ensureObjectRecord(raw, "Typed file content");

  if ("data" in parsed) {
    return {
      path: normalizeRelativePath(relativePath),
      data: ensureObjectRecord(parsed.data, "Typed file data"),
    };
  }

  return {
    path: normalizeRelativePath(relativePath),
    data: parsed,
  };
}

export async function saveTypedFileContent(
  projectRoot: string | null,
  relativePath: string,
  data: Record<string, unknown>,
): Promise<{ status: string; path: string }> {
  const filePath = resolveProjectPath(projectRoot, relativePath);
  const payload = {
    data,
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    status: "ok",
    path: normalizeRelativePath(relativePath),
  };
}

// Directories never scanned
const EXCLUDED_DIRS = new Set([".project", ".assistant", "node_modules", ".git", "wiki"]);
// JSON files that are clearly not typed content files
const EXCLUDED_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
]);

export interface TypedFileEntry {
  relativePath: string;
  label: string;
}

/** Returns true if the parsed JSON looks like a content file (not a system/config file). */
function isTypedFile(raw: unknown): boolean {
  // Must be a non-empty object (not array, not scalar)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw as object).length > 0;
}

async function walkForTypedFiles(
  dir: string,
  root: string,
  results: TypedFileEntry[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = path.join(dir, name);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(name) && !name.startsWith(".")) {
        await walkForTypedFiles(abs, root, results);
      }
    } else if (stat.isFile() && name.endsWith(".json") && !EXCLUDED_FILENAMES.has(name) && !name.startsWith(".")) {
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      let label = rel;
      try {
        const raw = await readJsonFile(abs);
        if (!isTypedFile(raw)) continue;
        const obj = raw as Record<string, unknown>;
        const data = (obj["data"] as Record<string, unknown>) ?? obj;
        const title = data["title"] ?? data["Titel"] ?? data["name"];
        if (typeof title === "string" && title.trim()) {
          label = `${title.trim()} (${rel})`;
        }
      } catch {
        continue;
      }
      results.push({ relativePath: rel, label });
    }
  }
}

export async function listTypedFiles(
  projectRoot: string | null,
): Promise<TypedFileEntry[]> {
  const root = ensureProjectRoot(projectRoot);
  const results: TypedFileEntry[] = [];
  await walkForTypedFiles(root, root, results);
  // Sort: book.json first, then alphabetically
  results.sort((a, b) => {
    const aIsBook = a.relativePath === "book.json" ? 0 : 1;
    const bIsBook = b.relativePath === "book.json" ? 0 : 1;
    if (aIsBook !== bIsBook) return aIsBook - bIsBook;
    return a.relativePath.localeCompare(b.relativePath);
  });
  return results;
}

export async function fillTypedFile(
  projectRoot: string | null,
  relativePath: string,
): Promise<TypedFileFillResult> {
  const current = await getTypedFileContent(projectRoot, relativePath);
  const draft = buildPlaceholderFill(current.data);

  if (Object.keys(current.data).length > 0) {
    mergeMissingFields(draft, current.data);
  }

  return {
    data: draft,
  };
}
