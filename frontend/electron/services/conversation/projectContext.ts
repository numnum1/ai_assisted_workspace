import fs from "node:fs/promises";
import path from "node:path";
import {
  emptyManifest,
  migrateSidecarsToManifest,
  readManifestFile,
  type BookManifest,
} from "../chapterManifest.js";

export interface ProjectConfigData {
  name: string;
  description: string;
  alwaysInclude: string[];
  defaultMode?: string;
  workspaceMode?: string;
  quickChatLlmId?: string;
  /** Max number of tool-call rounds before the loop exits (default: 6). */
  maxToolRounds?: number;
  /** Project-level AI rules injected into every system prompt. */
  rules?: { name: string; body: string }[];
  extraFeatures?: {
    chatDownload?: boolean;
  };
}

export interface PreviewBuildContext {
  projectPath: string | null;
  projectConfig?: ProjectConfigData | null;
  /** Compact wiki inventory injected into the system prompt (the writing equivalent of a source tree). */
  wikiIndex?: string;
  /** Book chapter structure: maps human-readable titles to UUID-based file paths for read_file. */
  chapterIndex?: string;
}

export function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function estimateTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function getAssistantDir(projectPath: string): string {
  return path.join(projectPath, ".assistant");
}

export function getProjectConfigPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), "project.json");
}

export function ensureProjectPath(projectPath: string | null): string {
  if (!projectPath) {
    throw new Error("Kein Projektpfad verfügbar.");
  }
  return projectPath;
}

export function resolveProjectPath(
  projectPath: string | null,
  relativePath: string,
): string {
  const root = ensureProjectPath(projectPath);
  const parts = normalizeText(relativePath)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  const resolved = path.resolve(root, ...parts);
  const rel = path.relative(root, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return resolved;
}

export async function readProjectConfig(
  projectPath: string | null,
): Promise<ProjectConfigData | null> {
  if (!projectPath) return null;
  const filePath = getProjectConfigPath(projectPath);
  const config = await readJsonFile<ProjectConfigData>(filePath);
  if (!config) return null;

  return {
    name: typeof config.name === "string" ? config.name : "",
    description:
      typeof config.description === "string" ? config.description : "",
    alwaysInclude: Array.isArray(config.alwaysInclude)
      ? config.alwaysInclude
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    defaultMode:
      typeof config.defaultMode === "string" ? config.defaultMode : undefined,
    workspaceMode:
      typeof config.workspaceMode === "string"
        ? config.workspaceMode
        : undefined,
    quickChatLlmId:
      typeof config.quickChatLlmId === "string"
        ? config.quickChatLlmId
        : undefined,
    rules: Array.isArray(config.rules)
      ? (config.rules as { name: string; body: string }[]).filter(
          (r) => r && typeof r === "object" && typeof r.name === "string" && r.name.trim().length > 0,
        )
      : undefined,
    extraFeatures:
      config.extraFeatures &&
      typeof config.extraFeatures === "object"
        ? {
            chatDownload:
              typeof config.extraFeatures.chatDownload === "boolean"
                ? config.extraFeatures.chatDownload
                : undefined,
          }
        : undefined,
  };
}

export async function buildFileTreeListing(
  projectPath: string,
  currentPath: string,
  indent = "",
): Promise<string[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const filtered = entries
    .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  const lines: string[] = [];
  for (const entry of filtered) {
    const marker = entry.isDirectory() ? "📁" : "📄";
    lines.push(`${indent}${marker} ${entry.name}`);
    if (entry.isDirectory()) {
      const childPath = path.join(currentPath, entry.name);
      lines.push(
        ...(await buildFileTreeListing(projectPath, childPath, `${indent}  `)),
      );
    }
  }
  return lines;
}

export function sliceByLineRange(
  content: string,
  startLine?: number,
  endLine?: number,
): string {
  if (startLine == null && endLine == null) {
    return content;
  }
  const lines = content.split(/\r\n|\r|\n/);
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? lines.length);
  return lines.slice(start - 1, end).join("\n");
}

export async function readReferencedProjectFile(
  projectPath: string | null,
  reference: string,
): Promise<{ path: string; content: string; label?: string } | null> {
  if (!projectPath) return null;
  const trimmed = normalizeText(reference);
  if (!trimmed) return null;

  if (trimmed.startsWith("scene:")) {
    const parts = trimmed.split(":");
    // format: scene:{chapterId}:{sceneId}[:{encodedTitle}]
    if (parts.length < 3) return null;
    const chapterId = parts[1];
    const sceneId = parts[2];
    if (!chapterId || !sceneId || /[/\\]/.test(chapterId) || /[/\\]/.test(sceneId)) return null;
    return readSceneReference(projectPath, chapterId, sceneId);
  }

  const match = /^(.*?)(?::(\d+)-(\d+))?$/.exec(trimmed);
  if (!match) return null;

  const relativePath = normalizeText(match[1]);
  if (!relativePath) return null;

  const filePath = resolveProjectPath(projectPath, relativePath);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    const raw = await fs.readFile(filePath, "utf8");
    const content = sliceByLineRange(
      raw,
      match[2] ? Number.parseInt(match[2], 10) : undefined,
      match[3] ? Number.parseInt(match[3], 10) : undefined,
    );
    return { path: trimmed, content };
  } catch {
    return null;
  }
}

/**
 * Read a structure root's manifest without persisting anything — the prompt path
 * must stay side-effect-free. Migrates the legacy sidecar tree in memory only;
 * the on-disk conversion happens when the user first edits structure (chapterService).
 */
async function readManifestForPrompt(structureBase: string): Promise<BookManifest> {
  const existing = await readManifestFile(structureBase);
  if (existing) return existing;
  return (await migrateSidecarsToManifest(structureBase)) ?? emptyManifest();
}

/** Collapse a description to a single compact line, capped so the index stays lean. */
function oneLineSummary(text: string, max = 200): string {
  const compact = normalizeText(text).replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

interface IndexScene {
  title: string;
  description: string;
  contentPaths: string[];
}
interface IndexChapter {
  title: string;
  description: string;
  scenes: IndexScene[];
}
interface IndexBook {
  synopsis: string;
  chapters: IndexChapter[];
}

/** Book synopsis lives in .project/book.json (extras.synopsis) — read it live so the index never goes stale. */
async function readBookSynopsis(bookRoot: string): Promise<string> {
  try {
    const raw = await fs.readFile(
      path.join(bookRoot, ".project", "book.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { extras?: Record<string, unknown> };
    const synopsis = parsed.extras?.synopsis;
    return typeof synopsis === "string" ? synopsis : "";
  } catch {
    return "";
  }
}

async function buildBookIndexModel(
  projectPath: string,
  bookRelPath: string | null,
): Promise<IndexBook> {
  const bookRoot = bookRelPath ? path.join(projectPath, bookRelPath) : projectPath;
  const manifest = await readManifestForPrompt(bookRoot);

  const chapters: IndexChapter[] = [];
  for (const chapter of manifest.chapters) {
    const scenes: IndexScene[] = [];
    for (const scene of chapter.scenes) {
      const contentPaths: string[] = [];
      for (const action of scene.actions) {
        const mdPath = path.join(
          bookRoot,
          ".project",
          "chapter",
          chapter.id,
          scene.id,
          `${action.id}.md`,
        );
        try {
          await fs.access(mdPath);
          contentPaths.push(path.relative(projectPath, mdPath).replace(/\\/g, "/"));
        } catch {
          /* md file missing */
        }
      }
      scenes.push({
        title: scene.title || "(ohne Titel)",
        description: scene.description ?? "",
        contentPaths,
      });
    }
    chapters.push({
      title: chapter.title || "(ohne Titel)",
      description: chapter.description ?? "",
      scenes,
    });
  }

  return { synopsis: await readBookSynopsis(bookRoot), chapters };
}

/** Render one book's chapters/scenes, injecting descriptions so the AI grasps intent without reading prose. */
function renderChapterLines(chapters: IndexChapter[], indent: string): string[] {
  const lines: string[] = [];
  for (const chapter of chapters) {
    const desc = oneLineSummary(chapter.description);
    lines.push(`${indent}Kapitel "${chapter.title}"${desc ? ` — ${desc}` : ""}`);
    for (const scene of chapter.scenes) {
      const sceneDesc = oneLineSummary(scene.description);
      const paths =
        scene.contentPaths.length > 0 ? scene.contentPaths.join(", ") : "(leer)";
      lines.push(
        `${indent}  Szene "${scene.title}"${sceneDesc ? ` — ${sceneDesc}` : ""} → ${paths}`,
      );
    }
  }
  return lines;
}

export async function buildBookChapterIndex(projectPath: string): Promise<string> {
  if (!projectPath) return "";

  const lines: string[] = [];

  // Root project book
  const root = await buildBookIndexModel(projectPath, null);
  const rootSynopsis = oneLineSummary(root.synopsis, 400);
  if (rootSynopsis) lines.push(`Buch-Synopsis: ${rootSynopsis}`);
  if (root.chapters.length > 0) {
    lines.push(...renderChapterLines(root.chapters, ""));
  }

  // Book subprojects
  try {
    const topEntries = await fs.readdir(projectPath, { withFileTypes: true });
    for (const entry of topEntries) {
      if (!entry.isDirectory()) continue;
      try {
        const subJsonPath = path.join(projectPath, entry.name, ".subproject.json");
        const raw = await fs.readFile(subJsonPath, "utf8");
        const meta = JSON.parse(raw) as { type?: string; name?: string };
        if (meta.type !== "book") continue;
        const book = await buildBookIndexModel(projectPath, entry.name);
        if (book.chapters.length === 0) continue;
        const bookName = meta.name ?? entry.name;
        lines.push(`Buch "${bookName}" (${entry.name}/)`);
        const bookSynopsis = oneLineSummary(book.synopsis, 400);
        if (bookSynopsis) lines.push(`  Synopsis: ${bookSynopsis}`);
        lines.push(...renderChapterLines(book.chapters, "  "));
      } catch { /* not a book subproject or unreadable */ }
    }
  } catch { /* can't read project dir */ }

  return lines.join("\n");
}

async function readSceneReference(
  projectPath: string,
  chapterId: string,
  sceneId: string,
): Promise<{ path: string; content: string; label: string } | null> {
  const manifest = await readManifestForPrompt(projectPath);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  const sceneContentDir = path.join(projectPath, ".project", "chapter", chapterId, sceneId);
  const parts: string[] = [];
  for (const action of scene.actions) {
    try {
      const raw = await fs.readFile(path.join(sceneContentDir, `${action.id}.md`), "utf8");
      const trimmed = raw.trim();
      if (trimmed) parts.push(trimmed);
    } catch { /* empty or missing */ }
  }

  const content = parts.join("\n\n");
  if (!content) return null;

  return {
    path: `scene:${chapterId}:${sceneId}`,
    content,
    label: scene.title || "Szene",
  };
}
