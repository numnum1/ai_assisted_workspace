import fs from "node:fs/promises";
import path from "node:path";

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

async function buildChapterEntriesForBook(
  projectPath: string,
  bookRelPath: string | null,
): Promise<Array<{ title: string; sortOrder: number; scenes: Array<{ title: string; sortOrder: number; contentPaths: string[] }> }>> {
  const bookRoot = bookRelPath ? path.join(projectPath, bookRelPath) : projectPath;
  const chapterDir = path.join(bookRoot, ".project", "chapter");

  let chapterEntries: import("node:fs").Dirent[];
  try {
    chapterEntries = await fs.readdir(chapterDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const chapters: Array<{ title: string; sortOrder: number; scenes: Array<{ title: string; sortOrder: number; contentPaths: string[] }> }> = [];

  for (const entry of chapterEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const chapterId = entry.name.slice(0, -5);

    let chapterTitle = "(ohne Titel)";
    let chapterSortOrder = 0;
    try {
      const raw = await fs.readFile(path.join(chapterDir, entry.name), "utf8");
      const meta = JSON.parse(raw) as { title?: string; sortOrder?: number };
      if (meta.title) chapterTitle = meta.title;
      chapterSortOrder = meta.sortOrder ?? 0;
    } catch { /* keep defaults */ }

    const sceneDir = path.join(chapterDir, chapterId);
    const scenes: Array<{ title: string; sortOrder: number; contentPaths: string[] }> = [];

    try {
      const sceneEntries = await fs.readdir(sceneDir, { withFileTypes: true });
      for (const sceneEntry of sceneEntries) {
        if (!sceneEntry.isFile() || !sceneEntry.name.endsWith(".json")) continue;
        const sceneId = sceneEntry.name.slice(0, -5);

        let sceneTitle = "(ohne Titel)";
        let sceneSortOrder = 0;
        try {
          const raw = await fs.readFile(path.join(sceneDir, sceneEntry.name), "utf8");
          const meta = JSON.parse(raw) as { title?: string; sortOrder?: number };
          if (meta.title) sceneTitle = meta.title;
          sceneSortOrder = meta.sortOrder ?? 0;
        } catch { /* keep defaults */ }

        const actionDir = path.join(sceneDir, sceneId);
        const contentPaths: { sortOrder: number; relPath: string }[] = [];
        try {
          const actionEntries = await fs.readdir(actionDir, { withFileTypes: true });
          for (const actionEntry of actionEntries) {
            if (!actionEntry.isFile() || !actionEntry.name.endsWith(".json")) continue;
            const actionId = actionEntry.name.slice(0, -5);
            const mdPath = path.join(actionDir, `${actionId}.md`);
            let actionSortOrder = 0;
            try {
              const raw = await fs.readFile(path.join(actionDir, actionEntry.name), "utf8");
              const meta = JSON.parse(raw) as { sortOrder?: number };
              actionSortOrder = meta.sortOrder ?? 0;
            } catch { /* keep 0 */ }
            try {
              await fs.access(mdPath);
              const relPath = path.relative(projectPath, mdPath).replace(/\\/g, "/");
              contentPaths.push({ sortOrder: actionSortOrder, relPath });
            } catch { /* md file missing */ }
          }
        } catch { /* no action dir */ }

        contentPaths.sort((a, b) => a.sortOrder - b.sortOrder);
        scenes.push({ title: sceneTitle, sortOrder: sceneSortOrder, contentPaths: contentPaths.map(c => c.relPath) });
      }
    } catch { /* no scene dir */ }

    scenes.sort((a, b) => a.sortOrder - b.sortOrder);
    chapters.push({ title: chapterTitle, sortOrder: chapterSortOrder, scenes });
  }

  chapters.sort((a, b) => a.sortOrder - b.sortOrder);
  return chapters;
}

export async function buildBookChapterIndex(projectPath: string): Promise<string> {
  if (!projectPath) return "";

  const lines: string[] = [];

  // Root project chapters
  const rootChapters = await buildChapterEntriesForBook(projectPath, null);
  if (rootChapters.length > 0) {
    for (const ch of rootChapters) {
      lines.push(`Kapitel "${ch.title}"`);
      for (const sc of ch.scenes) {
        const paths = sc.contentPaths.length > 0 ? sc.contentPaths.join(", ") : "(leer)";
        lines.push(`  Szene "${sc.title}" → ${paths}`);
      }
    }
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
        const bookName = meta.name ?? entry.name;
        const chapters = await buildChapterEntriesForBook(projectPath, entry.name);
        if (chapters.length === 0) continue;
        lines.push(`Buch "${bookName}" (${entry.name}/)`);
        for (const ch of chapters) {
          lines.push(`  Kapitel "${ch.title}"`);
          for (const sc of ch.scenes) {
            const paths = sc.contentPaths.length > 0 ? sc.contentPaths.join(", ") : "(leer)";
            lines.push(`    Szene "${sc.title}" → ${paths}`);
          }
        }
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
  const chapterDir = path.join(projectPath, ".project", "chapter", chapterId);
  const sceneMetaPath = path.join(chapterDir, `${sceneId}.json`);
  const sceneContentDir = path.join(chapterDir, sceneId);

  let sceneTitle = "Szene";
  try {
    const raw = await fs.readFile(sceneMetaPath, "utf8");
    const meta = JSON.parse(raw) as { title?: string };
    if (meta.title) sceneTitle = meta.title;
  } catch { /* use fallback */ }

  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(sceneContentDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const actions: { sortOrder: number; content: string }[] = [];
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
    const actionId = ent.name.slice(0, -5);
    let sortOrder = 0;
    try {
      const raw = await fs.readFile(path.join(sceneContentDir, ent.name), "utf8");
      const meta = JSON.parse(raw) as { sortOrder?: number };
      sortOrder = meta.sortOrder ?? 0;
    } catch { /* keep 0 */ }
    let content = "";
    try {
      content = await fs.readFile(path.join(sceneContentDir, `${actionId}.md`), "utf8");
    } catch { /* empty */ }
    actions.push({ sortOrder, content });
  }

  actions.sort((a, b) => a.sortOrder - b.sortOrder);
  const content = actions.map(a => a.content.trim()).filter(Boolean).join("\n\n");
  if (!content) return null;

  return { path: `scene:${chapterId}:${sceneId}`, content, label: sceneTitle };
}
