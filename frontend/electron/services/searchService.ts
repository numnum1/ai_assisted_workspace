import fs from "node:fs/promises";
import path from "node:path";

export interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export interface SearchResponse {
  hits: SearchHit[];
}

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return path.resolve(projectRoot);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function isSkippableDirectory(name: string): boolean {
  return (
    name === ".git" ||
    name === "node_modules" ||
    name === "dist" ||
    name === "dist-electron" ||
    name === ".idea" ||
    name === ".cursor" ||
    name === ".zed"
  );
}

function buildPreview(line: string, query: string, maxLength = 220): string {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  const lowerLine = compact.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerLine.indexOf(lowerQuery);

  if (matchIndex < 0) {
    return compact.length <= maxLength
      ? compact
      : `${compact.slice(0, maxLength).trimEnd()}…`;
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(compact.length, matchIndex + lowerQuery.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < compact.length ? "…" : "";

  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

async function collectFiles(rootPath: string, currentPath: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (isSkippableDirectory(entry.name)) continue;
      await collectFiles(rootPath, absPath, out);
      continue;
    }

    if (!entry.isFile()) continue;
    out.push(absPath);
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function searchInFile(absPath: string, projectRoot: string, query: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const relativePath = normalizeRelativePath(path.relative(projectRoot, absPath));
  const lowerQuery = query.toLowerCase();

  return hits;
}

export async function searchProjectContent(
  projectRoot: string | null,
  query: string,
  limit = 200,
): Promise<SearchResponse> {
  const root = ensureProjectRoot(projectRoot);
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { hits: [] };
  }

  const files: string[] = [];
  await collectFiles(root, root, files);

  const hits: SearchHit[] = [];
  const lowerQuery = trimmedQuery.toLowerCase();

  for (const absPath of files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
    if (hits.length >= limit) break;

    const content = await readTextFile(absPath);
    if (content == null) continue;

    const lines = content.split(/\r\n|\r|\n/);
    const relativePath = normalizeRelativePath(path.relative(root, absPath));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.toLowerCase().includes(lowerQuery)) continue;

      hits.push({
        path: relativePath,
        line: i + 1,
        preview: buildPreview(line, trimmedQuery),
      });

      if (hits.length >= limit) break;
    }
  }

  return { hits };
}
