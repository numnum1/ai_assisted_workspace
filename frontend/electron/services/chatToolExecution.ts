import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeText,
  ensureProjectPath,
  resolveProjectPath,
} from "./conversation/projectContext.js";
import { semanticSearch, type EmbeddingConfig } from "./vectorService.js";
import { createSnapshot } from "./snapshotService.js";
import { appendJournalEntry, appendConflict } from "./journalService.js";
import { safeJsonParse } from "./openAiClient.js";
import type { ToolCall } from "../../src/types.js";

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
  return fs.readFile(targetPath, "utf8");
}

async function addGlossaryEntryLocally(
  projectPath: string | null,
  term: string,
  definition: string,
): Promise<string> {
  const root = ensureProjectPath(projectPath);
  const glossaryPath = path.join(root, ".assistant", "glossary.md");
  await fs.mkdir(path.dirname(glossaryPath), { recursive: true });

  const normalizedTerm = normalizeText(term);
  const normalizedDefinition = normalizeText(definition);
  if (!normalizedTerm || !normalizedDefinition) {
    throw new Error("Glossary term and definition are required.");
  }

  let existing = "";
  try {
    existing = await fs.readFile(glossaryPath, "utf8");
  } catch {
    existing = "";
  }

  const entry = `- **${normalizedTerm}**: ${normalizedDefinition}`;
  const next = existing.trim() ? `${existing.trim()}\n${entry}\n` : `${entry}\n`;
  await fs.writeFile(glossaryPath, next, "utf8");
  return `glossary_add:success:${normalizedTerm}`;
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

export function buildGuidedThreadOfferFence(args: {
  steeringPlanMarkdown?: unknown;
  threadTitle?: unknown;
  summary?: unknown;
  modeId?: unknown;
  agentPresetId?: unknown;
}): string | null {
  const steeringPlanMarkdown =
    typeof args.steeringPlanMarkdown === "string" ? args.steeringPlanMarkdown.trim() : "";
  if (!steeringPlanMarkdown) return null;

  const payload: Record<string, string> = { steeringPlanMarkdown };
  if (typeof args.threadTitle === "string" && args.threadTitle.trim())
    payload.threadTitle = args.threadTitle.trim();
  if (typeof args.summary === "string" && args.summary.trim())
    payload.summary = args.summary.trim();
  if (typeof args.modeId === "string" && args.modeId.trim())
    payload.modeId = args.modeId.trim();
  if (typeof args.agentPresetId === "string" && args.agentPresetId.trim())
    payload.agentPresetId = args.agentPresetId.trim();

  return `\`\`\`guided_thread_offer\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

export function buildThreadResultFence(args: {
  summary?: unknown;
  threadTitle?: unknown;
  updatedFiles?: unknown;
}): string | null {
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) return null;

  const payload: Record<string, unknown> = { summary };
  if (typeof args.threadTitle === "string" && args.threadTitle.trim())
    payload.threadTitle = args.threadTitle.trim();
  if (Array.isArray(args.updatedFiles) && args.updatedFiles.length > 0) {
    const files = args.updatedFiles.filter((f) => typeof f === "string" && (f as string).trim());
    if (files.length > 0) payload.updatedFiles = files;
  }

  return `\`\`\`thread_result\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

export function describeStreamingToolCall(toolCall: ToolCall): string {
  const name = toolCall.function.name;
  if (name === "read_file") return "Lese Datei";
  if (name === "semantic_search") return "Semantische Suche";
  if (name === "glossary_add") return "Ergänze Glossar";
  if (name === "write_file") return "Schreibe Datei";
  if (name === "edit_file") return "Bearbeite Datei";
  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "propose_guided_thread") return "Biete Guided Thread an";
  if (name === "report_thread_result") return "Übermittle Thread-Ergebnis";
  if (name === "create_artifact") return "Erstelle Arbeitsnotiz";
  if (name === "journal_log") return "Notiere ins Journal";
  if (name === "flag_conflict") return "Markiere Widerspruch";
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
    result = await readProjectFile(projectPath, filePath);
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
  } else if (name === "glossary_add") {
    const term = normalizeText(String(args.term ?? ""));
    const definition = normalizeText(String(args.definition ?? ""));
    result = await addGlossaryEntryLocally(projectPath, term, definition);
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
  } else if (name === "propose_guided_thread") {
    const offer = buildGuidedThreadOfferFence({
      steeringPlanMarkdown: args.steeringPlanMarkdown,
      threadTitle: args.threadTitle,
      summary: args.summary,
      modeId: args.modeId,
      agentPresetId: args.agentPresetId,
    });
    if (!offer) throw new Error("propose_guided_thread requires steeringPlanMarkdown.");
    result = offer;
  } else if (name === "report_thread_result") {
    const fence = buildThreadResultFence({
      summary: args.summary,
      threadTitle: args.threadTitle,
      updatedFiles: args.updatedFiles,
    });
    if (!fence) throw new Error("report_thread_result requires a non-empty summary.");
    result = fence;
  } else if (name === "create_artifact") {
    const title = normalizeText(String(args.title ?? "Arbeitsnotiz"));
    const content = typeof args.content === "string" ? args.content : "";
    const id = typeof args.id === "string" && args.id ? args.id : undefined;
    const meta: Record<string, string> = { title };
    if (id) meta.id = id;
    result = `\`\`\`artifact\n${JSON.stringify(meta)}\n\n${content}\n\`\`\``;
  } else if (name === "journal_log") {
    const type = normalizeText(String(args.type ?? "KANON"));
    const text = typeof args.text === "string" ? args.text : String(args.text ?? "");
    result = await appendJournalEntry(projectPath, type, text);
  } else if (name === "flag_conflict") {
    const description =
      typeof args.description === "string" ? args.description : String(args.description ?? "");
    result = await appendConflict(projectPath, description);
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
