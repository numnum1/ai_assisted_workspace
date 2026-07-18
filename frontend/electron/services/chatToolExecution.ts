import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeText,
  ensureProjectPath,
  resolveProjectPath,
} from "./conversation/projectContext.js";
import { semanticSearch, type EmbeddingConfig } from "./vectorService.js";
import {
  grepProject,
  formatGrepResult,
  type GrepOutputMode,
} from "./grepService.js";
import { createSnapshot } from "./snapshotService.js";
import { safeJsonParse } from "./openAiClient.js";
import type { ToolCall } from "../../src/shared/types.js";

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  description: string;
  result: string;
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

async function readProjectFile(
  projectPath: string | null,
  relativePath: string,
  offset?: number,
  limit?: number,
): Promise<string> {
  const targetPath = resolveProjectPath(projectPath, relativePath);
  console.debug(
    `[chat] read_file: relativePath="${relativePath}" → targetPath="${targetPath}"`,
  );
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(targetPath);
  } catch (e) {
    if (isEnoent(e)) {
      console.debug(`[chat] read_file: no file at "${targetPath}", returning empty string`);
      return "";
    }
    throw e;
  }
  if (!stat.isFile()) throw new Error(`Not a file: ${relativePath}`);
  const content = await fs.readFile(targetPath, "utf8");

  const hasOffset = typeof offset === "number" && Number.isFinite(offset);
  const hasLimit = typeof limit === "number" && Number.isFinite(limit);
  if (!hasOffset && !hasLimit) return content;

  const lines = content.split(/\r\n|\r|\n/);
  const start = hasOffset ? Math.max(0, Math.floor(offset) - 1) : 0;
  const end = hasLimit ? start + Math.max(0, Math.floor(limit)) : lines.length;
  return lines.slice(start, end).join("\n");
}

async function writeProjectFile(
  projectPath: string | null,
  filePath: string,
  content: string,
): Promise<string> {
  const targetPath = resolveProjectPath(projectPath, filePath);
  let existed = true;
  let oldContent = "";
  try {
    oldContent = await fs.readFile(targetPath, "utf8");
  } catch {
    existed = false;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");

  const relative = normalizeText(filePath).replace(/\\/g, "/");
  const snapshot = createSnapshot(relative, oldContent, !existed);
  const description = existed ? "Datei aktualisiert" : "Neue Datei erstellt";
  return `write_file:success:${snapshot.id}:${existed ? "modified" : "new"}:${relative}:${description}`;
}

async function editProjectFile(
  projectPath: string | null,
  filePath: string,
  oldString: string,
  newString: string,
): Promise<string> {
  if (!oldString) throw new Error("edit_file: 'old' must not be empty.");
  const targetPath = resolveProjectPath(projectPath, filePath);
  const oldContent = await fs.readFile(targetPath, "utf8");

  const occurrences = oldContent.split(oldString).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `edit_file: 'old' string not found in ${filePath}. ` +
        "Copy the exact text (including whitespace) from read_file output.",
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `edit_file: 'old' string appears ${occurrences} times in ${filePath}. ` +
        "Provide a longer, unique context string.",
    );
  }

  const updated = oldContent.replace(oldString, newString);
  await fs.writeFile(targetPath, updated, "utf8");

  const relative = normalizeText(filePath).replace(/\\/g, "/");
  const snapshot = createSnapshot(relative, oldContent, false);
  return `write_file:success:${snapshot.id}:modified:${relative}:Datei bearbeitet`;
}

export function buildClarificationFence(
  questions: unknown,
): { text: string; normalizedQuestions: unknown[] } | null {
  const normalizedQuestions = Array.isArray(questions)
    ? questions.filter(
        (q) =>
          q &&
          typeof q === "object" &&
          typeof (q as { question?: unknown }).question === "string" &&
          Array.isArray((q as { options?: unknown }).options),
      )
    : questions &&
        typeof questions === "object" &&
        typeof (questions as { question?: unknown }).question === "string" &&
        Array.isArray((questions as { options?: unknown }).options)
      ? [questions]
      : [];

  if (normalizedQuestions.length === 0) return null;

  return {
    text: `\`\`\`clarification\n${JSON.stringify(normalizedQuestions, null, 2)}\n\`\`\``,
    normalizedQuestions,
  };
}

export function buildYesNoFence(question: string): string {
  return `\`\`\`yes_no\n${JSON.stringify({ question })}\n\`\`\``;
}

export function describeStreamingToolCall(toolCall: ToolCall): string {
  const name = toolCall.function.name;
  if (name === "read_file") return "Lese Datei";
  if (name === "grep") return "Durchsuche Dateien (grep)";
  if (name === "semantic_search") return "Semantische Suche";
  if (name === "write_file") return "Schreibe Datei";
  if (name === "edit_file") return "Bearbeite Datei";
  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "ask_yes_no") return "Ja/Nein-Frage";
  return `Tool: ${name}`;
}

export async function executeToolCall(
  projectPath: string | null,
  toolCall: ToolCall,
  embeddingConfig?: EmbeddingConfig,
): Promise<ToolExecutionResult> {
  const name = toolCall.function.name;
  const args = safeJsonParse<Record<string, unknown>>(toolCall.function.arguments) ?? {};

  let result = "";
  if (name === "read_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    const offset = typeof args.offset === "number" ? args.offset : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    result = await readProjectFile(projectPath, filePath, offset, limit);
  } else if (name === "grep") {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    const rawMode = typeof args.output_mode === "string" ? args.output_mode : "content";
    const outputMode: GrepOutputMode =
      rawMode === "files_with_matches" || rawMode === "count" ? rawMode : "content";
    const grepResult = await grepProject(projectPath, pattern, {
      glob: typeof args.glob === "string" ? args.glob : undefined,
      outputMode,
      caseInsensitive: args.case_insensitive === true,
      contextLines: typeof args.context_lines === "number" ? args.context_lines : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    result = formatGrepResult(grepResult);
  } else if (name === "semantic_search") {
    const query = normalizeText(String(args.query ?? ""));
    const limit = typeof args.limit === "number" ? Math.round(args.limit) : 10;
    const rawScope = typeof args.scope === "string" ? args.scope : "all";
    const scope = rawScope === "project" || rawScope === "wiki" ? rawScope : "all";
    const root = ensureProjectPath(projectPath);

    if (!embeddingConfig?.apiKey || !embeddingConfig?.apiUrl) {
      result = JSON.stringify({ error: "No AI provider configured for embeddings." });
    } else {
      const searchResult = await semanticSearch(root, query, embeddingConfig, { limit, scope });
      const payload: Record<string, unknown> = { hits: searchResult.hits };
      if (searchResult.usedFallback) {
        payload.note = `Semantic index not available (${searchResult.fallbackReason ?? "unknown"}). Keyword search used as fallback.`;
      }
      result = JSON.stringify(payload);
    }
  } else if (name === "write_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    const content = typeof args.content === "string" ? args.content : "";
    result = await writeProjectFile(projectPath, filePath, content);
  } else if (name === "edit_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    const oldString = typeof args.old === "string" ? args.old : "";
    const newString = typeof args.new === "string" ? args.new : "";
    result = await editProjectFile(projectPath, filePath, oldString, newString);
  } else if (name === "ask_clarification") {
    const clarification = buildClarificationFence(args.questions ?? args);
    if (!clarification) throw new Error("ask_clarification requires at least one valid question.");
    result = clarification.text;
  } else if (name === "ask_yes_no") {
    const question = normalizeText(String(args.question ?? ""));
    if (!question) throw new Error("ask_yes_no requires a non-empty question.");
    result = buildYesNoFence(question);
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return {
    toolCallId: toolCall.id,
    name,
    description: describeStreamingToolCall(toolCall),
    result,
  };
}
