import fs from "node:fs/promises";
import path from "node:path";

export interface ProjectConfigData {
  name: string;
  description: string;
  alwaysInclude: string[];
  defaultMode?: string;
  workspaceMode?: string;
  quickChatLlmId?: string;
  extraFeatures?: {
    chatDownload?: boolean;
  };
}

export interface PreviewBuildContext {
  projectPath: string | null;
  projectConfig?: ProjectConfigData | null;
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

export function getGlossaryPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), "glossary.md");
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

export async function readGlossaryContent(
  projectPath: string | null,
): Promise<string> {
  if (!projectPath) return "";
  const glossaryPath = getGlossaryPath(projectPath);
  if (!(await pathExists(glossaryPath))) {
    return "";
  }
  try {
    return (await fs.readFile(glossaryPath, "utf8")).trim();
  } catch {
    return "";
  }
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
): Promise<{ path: string; content: string } | null> {
  if (!projectPath) return null;
  const trimmed = normalizeText(reference);
  if (!trimmed) return null;

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
