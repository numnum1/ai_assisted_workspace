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
