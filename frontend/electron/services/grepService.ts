import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Regex-based content search over project files — the "grep" half of the
// coding-agent loop. Returns WHERE a pattern occurs (file + line), so the AI
// can then read just that slice with read_file(offset/limit) instead of pulling
// whole files into context. Deterministic and exact — the right tool for things
// like alias resolution ("Will" → which wiki file), where semantic_search fails.
// ---------------------------------------------------------------------------

export type GrepOutputMode = "content" | "files_with_matches" | "count";

export interface GrepOptions {
  /** Glob filter on the path, e.g. star-dot-md or a nested wiki glob. Empty = all files. */
  glob?: string;
  /** What to return. Defaults to "content". */
  outputMode?: GrepOutputMode;
  /** Case-insensitive matching. Defaults to false (case-sensitive). */
  caseInsensitive?: boolean;
  /** Lines of context to include before and after each match (content mode). */
  contextLines?: number;
  /** Maximum number of results (matches / files / counted files). */
  limit?: number;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  ".idea",
  ".cursor",
  ".zed",
]);

const NUL = String.fromCharCode(0);

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return path.resolve(projectRoot);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Convert a glob pattern to an anchored RegExp.
 * Supports `*` (any chars except `/`), `**` (any chars incl. `/`), and `?`.
 * A pattern without a slash is matched against the basename, so `*.md` finds
 * every Markdown file regardless of directory (ripgrep-style convenience).
 */
function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/").replace(/^\.?\//, "");
  let re = "";

  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i += 1;
        if (g[i + 1] === "/") i += 1; // consume the slash after **
        re += ".*";
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("/.+^${}()|[]".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }

  return new RegExp(`^${re}$`, "i");
}

function makeGlobMatcher(glob?: string): (relPath: string) => boolean {
  const trimmed = (glob ?? "").trim();
  if (!trimmed) return () => true;

  const matchesBasename = !trimmed.includes("/");
  const regExp = globToRegExp(trimmed);

  return (relPath: string) => {
    const target = matchesBasename ? path.posix.basename(relPath) : relPath;
    return regExp.test(target);
  };
}

function compilePattern(pattern: string, caseInsensitive?: boolean): RegExp {
  try {
    return new RegExp(pattern, caseInsensitive ? "i" : "");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regular expression: ${reason}`);
  }
}

async function collectFiles(
  root: string,
  currentPath: string,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(root, absPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(absPath);
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  // Skip binary-ish files: a NUL byte in the first KB is a strong signal.
  if (content.slice(0, 1024).includes(NUL)) return null;
  return content;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface GrepResult {
  mode: GrepOutputMode;
  /** content mode */
  matches: GrepMatch[];
  /** files_with_matches mode */
  files: string[];
  /** count mode */
  counts: Array<{ path: string; count: number }>;
  truncated: boolean;
}

export async function grepProject(
  projectRoot: string | null,
  pattern: string,
  options: GrepOptions = {},
): Promise<GrepResult> {
  const root = ensureProjectRoot(projectRoot);
  const trimmedPattern = pattern?.trim() ?? "";
  if (!trimmedPattern) {
    throw new Error("grep: 'pattern' must not be empty.");
  }

  const mode: GrepOutputMode = options.outputMode ?? "content";
  const limit = Math.max(1, options.limit ?? 100);
  const contextLines = Math.max(0, Math.min(options.contextLines ?? 0, 10));
  const regExp = compilePattern(trimmedPattern, options.caseInsensitive);
  const globMatches = makeGlobMatcher(options.glob);

  const absFiles: string[] = [];
  await collectFiles(root, root, absFiles);
  absFiles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const matches: GrepMatch[] = [];
  const files: string[] = [];
  const counts: Array<{ path: string; count: number }> = [];
  let truncated = false;

  for (const absPath of absFiles) {
    const relPath = normalizeRelativePath(path.relative(root, absPath));
    if (!globMatches(relPath)) continue;

    const content = await readTextFile(absPath);
    if (content == null) continue;

    const lines = content.split(/\r\n|\r|\n/);
    let fileMatchCount = 0;

    for (let i = 0; i < lines.length; i++) {
      regExp.lastIndex = 0;
      if (!regExp.test(lines[i] ?? "")) continue;
      fileMatchCount += 1;

      if (mode === "content") {
        const from = Math.max(0, i - contextLines);
        const to = Math.min(lines.length - 1, i + contextLines);
        for (let j = from; j <= to; j++) {
          // Avoid duplicating context lines that an earlier, overlapping match
          // window already emitted for this same file.
          const last = matches[matches.length - 1];
          if (last && last.path === relPath && last.line >= j + 1) continue;
          matches.push({ path: relPath, line: j + 1, text: lines[j] ?? "" });
        }
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
      }
    }

    if (fileMatchCount > 0) {
      if (mode === "files_with_matches") {
        files.push(relPath);
        if (files.length >= limit) {
          truncated = true;
          break;
        }
      } else if (mode === "count") {
        counts.push({ path: relPath, count: fileMatchCount });
        if (counts.length >= limit) {
          truncated = true;
          break;
        }
      }
    }

    if (mode === "content" && matches.length >= limit) {
      truncated = true;
      break;
    }
  }

  return { mode, matches, files, counts, truncated };
}

/**
 * Render a grep result as a compact, token-efficient string for the LLM.
 * content        → "path:line: text"
 * files_with_... → newline-joined relative paths
 * count          → "path: N" lines
 */
export function formatGrepResult(result: GrepResult): string {
  const lines: string[] = [];

  if (result.mode === "files_with_matches") {
    if (result.files.length === 0) return "grep: no matches.";
    lines.push(...result.files);
  } else if (result.mode === "count") {
    if (result.counts.length === 0) return "grep: no matches.";
    lines.push(...result.counts.map((c) => `${c.path}: ${c.count}`));
  } else {
    if (result.matches.length === 0) return "grep: no matches.";
    lines.push(...result.matches.map((m) => `${m.path}:${m.line}: ${m.text}`));
  }

  if (result.truncated) {
    lines.push("… (results truncated; refine the pattern or raise limit)");
  }

  return lines.join("\n");
}
