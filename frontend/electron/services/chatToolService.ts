import fs from "node:fs/promises";
import path from "node:path";

export interface ChatToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatToolExecutionResult {
  assistantToolCallMessage: {
    role: "assistant";
    content: string;
    toolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    hidden?: boolean;
  };
  toolResultMessages: Array<{
    role: "tool";
    toolCallId: string;
    content: string;
    hidden?: boolean;
  }>;
}

interface SearchProjectHit {
  path: string;
  snippet: string;
}

interface WikiSearchHit {
  path: string;
  title: string;
  snippet: string;
}

interface GlossaryEntryDto {
  term: string;
  definition: string;
}

const ASSISTANT_DIR = ".assistant";
const GLOSSARY_FILE = "glossary.md";

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

function resolveProjectPath(
  projectRoot: string | null,
  relativePath: string,
): string {
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

function trimToSnippet(text: string, maxLength = 220): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function createToolResultMessage(
  toolCallId: string,
  content: string,
): {
  role: "tool";
  toolCallId: string;
  content: string;
  hidden?: boolean;
} {
  return {
    role: "tool",
    toolCallId,
    content,
    hidden: false,
  };
}

function createAssistantToolCallMessage(toolCall: ChatToolCall): {
  role: "assistant";
  content: string;
  toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  hidden?: boolean;
} {
  return {
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: toolCall.id,
        type: toolCall.type,
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      },
    ],
    hidden: false,
  };
}

async function listProjectFiles(
  projectRoot: string,
  currentPath: string,
  out: string[],
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "dist"
    ) {
      continue;
    }

    const absPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await listProjectFiles(projectRoot, absPath, out);
      continue;
    }

    if (!entry.isFile()) continue;
    out.push(normalizeRelativePath(path.relative(projectRoot, absPath)));
  }
}

async function searchProject(
  projectRoot: string,
  query: string,
  limit = 20,
): Promise<SearchProjectHit[]> {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [];

  const files: string[] = [];
  await listProjectFiles(projectRoot, projectRoot, files);

  const results: SearchProjectHit[] = [];

  for (const relativePath of files.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )) {
    const haystackPath = relativePath.toLowerCase();
    if (haystackPath.includes(trimmedQuery)) {
      results.push({
        path: relativePath,
        snippet: relativePath,
      });
      if (results.length >= limit) break;
      continue;
    }

    try {
      const absPath = path.join(
        projectRoot,
        ...splitRelativePath(relativePath),
      );
      const content = await fs.readFile(absPath, "utf8");
      const normalizedContent = content.toLowerCase();
      if (!normalizedContent.includes(trimmedQuery)) {
        continue;
      }

      const index = normalizedContent.indexOf(trimmedQuery);
      const start = Math.max(0, index - 80);
      const end = Math.min(content.length, index + trimmedQuery.length + 120);

      results.push({
        path: relativePath,
        snippet: trimToSnippet(content.slice(start, end)),
      });
      if (results.length >= limit) break;
    } catch {
      // ignore unreadable/non-text files
    }
  }

  return results;
}

async function getWikiRoot(projectRoot: string): Promise<string> {
  const subDir = path.join(projectRoot, "wiki");
  try {
    const stat = await fs.stat(subDir);
    if (stat.isDirectory()) return subDir;
  } catch {
    // no wiki subdirectory — use project root directly
  }
  return projectRoot;
}

async function collectWikiFiles(
  wikiRoot: string,
  currentPath: string,
  out: string[],
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectWikiFiles(wikiRoot, absPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    out.push(normalizeRelativePath(path.relative(wikiRoot, absPath)));
  }
}

function inferWikiTitle(relativeWikiPath: string, content: string): string {
  const lines = content.split(/\r\n|\r|\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim() || path.basename(relativeWikiPath, ".md");
    }
  }

  for (const line of lines.slice(0, 20)) {
    const match = /^\s*name\s*:\s*(.+)\s*$/i.exec(line);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return path.basename(relativeWikiPath, ".md");
}

async function wikiRead(
  projectRoot: string,
  relativeWikiPath: string,
): Promise<{ path: string; content: string }> {
  const wikiRoot = await getWikiRoot(projectRoot);
  const targetPath = path.resolve(
    wikiRoot,
    ...splitRelativePath(relativeWikiPath),
  );
  const relativeToRoot = path.relative(wikiRoot, targetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    try {
      await fs.access(targetPath);
    } catch (e) {
      if (isEnoent(e)) {
        return {
          path: normalizeRelativePath(relativeWikiPath),
          content: "",
        };
      }
      throw e;
    }
    throw new Error(`Wiki path escapes wiki root: ${relativeWikiPath}`);
  }
  if (!targetPath.toLowerCase().endsWith(".md")) {
    throw new Error("Wiki only supports Markdown files.");
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(targetPath);
  } catch (e) {
    if (isEnoent(e)) {
      return {
        path: normalizeRelativePath(relativeWikiPath),
        content: "",
      };
    }
    throw e;
  }
  if (!stat.isFile()) {
    throw new Error(`Wiki path is not a file: ${relativeWikiPath}`);
  }

  const content = await fs.readFile(targetPath, "utf8");
  return {
    path: normalizeRelativePath(relativeWikiPath),
    content,
  };
}

async function wikiSearch(
  projectRoot: string,
  query: string,
  limit = 20,
): Promise<WikiSearchHit[]> {
  const wikiRoot = await getWikiRoot(projectRoot);
  if (!(await pathExists(wikiRoot))) {
    return [];
  }

  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [];

  const files: string[] = [];
  await collectWikiFiles(wikiRoot, wikiRoot, files);

  const results: WikiSearchHit[] = [];
  for (const relativePath of files.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )) {
    const absPath = path.join(wikiRoot, ...splitRelativePath(relativePath));
    const content = await fs.readFile(absPath, "utf8");
    const normalized = content.toLowerCase();
    if (!normalized.includes(trimmedQuery)) continue;

    const index = normalized.indexOf(trimmedQuery);
    const start = Math.max(0, index - 80);
    const end = Math.min(content.length, index + trimmedQuery.length + 120);

    results.push({
      path: relativePath,
      title: inferWikiTitle(relativePath, content),
      snippet: trimToSnippet(content.slice(start, end)),
    });

    if (results.length >= limit) break;
  }

  return results;
}

function getGlossaryPath(projectRoot: string): string {
  return path.join(projectRoot, ASSISTANT_DIR, GLOSSARY_FILE);
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeTerm(term: string): string {
  const value = term.trim();
  if (!value) {
    throw new Error("Glossary term must not be empty.");
  }
  return value;
}

function normalizeDefinition(definition: string): string {
  const value = definition.trim();
  if (!value) {
    throw new Error("Glossary definition must not be empty.");
  }
  return value;
}

function escapeMarkdownInline(input: string): string {
  return input.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function splitGlossaryContent(content: string): {
  prefixMarkdown: string;
  entries: GlossaryEntryDto[];
} {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split("\n");

  const entries: GlossaryEntryDto[] = [];
  const prefixLines: string[] = [];

  let index = 0;
  let foundFirstEntry = false;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*:\s*(.*)$/);

    if (!match) {
      if (foundFirstEntry) {
        break;
      }
      prefixLines.push(line);
      index += 1;
      continue;
    }

    foundFirstEntry = true;

    const term = match[1].trim();
    const definitionLines: string[] = [match[2] ?? ""];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index];
      if (/^\s*[-*]\s+\*\*(.+?)\*\*:\s*(.*)$/.test(nextLine)) {
        break;
      }
      definitionLines.push(nextLine);
      index += 1;
    }

    entries.push({
      term,
      definition: definitionLines.join("\n").trim(),
    });
  }

  return {
    prefixMarkdown: prefixLines.join("\n").trim(),
    entries,
  };
}

function buildGlossaryContent(
  prefixMarkdown: string,
  entries: GlossaryEntryDto[],
): string {
  const normalizedPrefix = normalizeLineEndings(prefixMarkdown).trim();
  const entryBlocks = entries.map((entry) => {
    const safeTerm = escapeMarkdownInline(entry.term.trim());
    const normalizedDefinition = normalizeLineEndings(entry.definition).trim();

    if (normalizedDefinition.includes("\n")) {
      const definitionLines = normalizedDefinition.split("\n");
      const [firstLine, ...rest] = definitionLines;
      const continuation = rest.map((line) => `  ${line}`).join("\n");
      return continuation
        ? `- **${safeTerm}**: ${firstLine}\n${continuation}`
        : `- **${safeTerm}**: ${firstLine}`;
    }

    return `- **${safeTerm}**: ${normalizedDefinition}`;
  });

  const parts: string[] = [];
  if (normalizedPrefix) {
    parts.push(normalizedPrefix);
  }
  if (entryBlocks.length > 0) {
    parts.push(entryBlocks.join("\n"));
  }

  return parts.join("\n\n").trim();
}

async function addGlossaryEntry(
  projectRoot: string,
  term: string,
  definition: string,
): Promise<GlossaryEntryDto> {
  const glossaryPath = getGlossaryPath(projectRoot);
  const normalizedTerm = normalizeTerm(term);
  const normalizedDefinition = normalizeDefinition(definition);

  let prefixMarkdown = "";
  let entries: GlossaryEntryDto[] = [];

  if (await pathExists(glossaryPath)) {
    const existing = await fs.readFile(glossaryPath, "utf8");
    const parsed = splitGlossaryContent(existing);
    prefixMarkdown = parsed.prefixMarkdown;
    entries = parsed.entries;
  }

  const nextEntry: GlossaryEntryDto = {
    term: normalizedTerm,
    definition: normalizedDefinition,
  };

  const existingIndex = entries.findIndex(
    (entry) =>
      entry.term.localeCompare(normalizedTerm, undefined, {
        sensitivity: "accent",
      }) === 0,
  );

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  entries.sort((a, b) =>
    a.term.localeCompare(b.term, undefined, { sensitivity: "base" }),
  );

  const content = buildGlossaryContent(prefixMarkdown, entries);
  await fs.mkdir(path.dirname(glossaryPath), { recursive: true });
  await fs.writeFile(glossaryPath, content ? `${content}\n` : "", "utf8");

  return nextEntry;
}

async function readProjectFile(
  projectRoot: string,
  relativePath: string,
): Promise<{ path: string; content: string; lines: number }> {
  const filePath = resolveProjectPath(projectRoot, relativePath);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch (e) {
    if (isEnoent(e)) {
      return {
        path: normalizeRelativePath(relativePath),
        content: "",
        lines: 0,
      };
    }
    throw e;
  }

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }

  const content = await fs.readFile(filePath, "utf8");
  return {
    path: normalizeRelativePath(relativePath),
    content,
    lines: countLines(content),
  };
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<{
  path: string;
  status: string;
  isNew: boolean;
  snapshotId: string;
}> {
  const targetPath = resolveProjectPath(projectRoot, relativePath);
  const isNew = !(await pathExists(targetPath));
  const oldContent = isNew ? "" : await fs.readFile(targetPath, "utf8");
  const snapshotId = `electron-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");

  const snapshotsDir = path.join(projectRoot, ASSISTANT_DIR, "snapshots");
  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.writeFile(
    path.join(snapshotsDir, `${snapshotId}.json`),
    `${JSON.stringify(
      {
        id: snapshotId,
        path: normalizeRelativePath(relativePath),
        oldContent,
        wasNew: isNew,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    path: normalizeRelativePath(relativePath),
    status: "ok",
    isNew,
    snapshotId,
  };
}

function parseToolArgs<T>(toolCall: ChatToolCall): T {
  const raw = toolCall.function.arguments;
  if (!raw?.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `Invalid JSON arguments for tool ${toolCall.function.name}`,
    );
  }
}

async function executeSingleToolCall(
  projectRoot: string,
  toolCall: ChatToolCall,
): Promise<{
  role: "tool";
  toolCallId: string;
  content: string;
  hidden?: boolean;
}> {
  const name = toolCall.function.name;

  if (name === "read_file") {
    const args = parseToolArgs<{ path?: string }>(toolCall);
    const relativePath = typeof args.path === "string" ? args.path : "";
    const result = await readProjectFile(projectRoot, relativePath);
    return createToolResultMessage(toolCall.id, JSON.stringify(result));
  }

  if (name === "search_project") {
    const args = parseToolArgs<{ query?: string; limit?: number }>(toolCall);
    const query = typeof args.query === "string" ? args.query : "";
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const result = await searchProject(projectRoot, query, limit);
    return createToolResultMessage(
      toolCall.id,
      JSON.stringify({ hits: result }),
    );
  }

  if (name === "wiki_read") {
    const args = parseToolArgs<{ path?: string }>(toolCall);
    const relativePath = typeof args.path === "string" ? args.path : "";
    const result = await wikiRead(projectRoot, relativePath);
    return createToolResultMessage(toolCall.id, JSON.stringify(result));
  }

  if (name === "wiki_search") {
    const args = parseToolArgs<{ query?: string; limit?: number }>(toolCall);
    const query = typeof args.query === "string" ? args.query : "";
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const result = await wikiSearch(projectRoot, query, limit);
    return createToolResultMessage(
      toolCall.id,
      JSON.stringify({ hits: result }),
    );
  }

  if (name === "ask_clarification") {
    const args = parseToolArgs<{
      questions?:
        | Array<{
            question?: string;
            options?: string[];
            allow_multiple?: boolean;
          }>
        | {
            question?: string;
            options?: string[];
            allow_multiple?: boolean;
          };
    }>(toolCall);

    const rawQuestions = Array.isArray(args.questions)
      ? args.questions
      : args.questions
        ? [args.questions]
        : [];

    const questions = rawQuestions
      .map((entry) => {
        const question =
          entry && typeof entry.question === "string"
            ? entry.question.trim()
            : "";
        const options = Array.isArray(entry?.options)
          ? entry.options
              .filter((option): option is string => typeof option === "string")
              .map((option) => option.trim())
              .filter(Boolean)
          : [];
        const allow_multiple = entry?.allow_multiple === true;

        if (!question || options.length === 0) {
          return null;
        }

        return {
          question,
          options,
          ...(allow_multiple ? { allow_multiple: true } : {}),
        };
      })
      .filter(
        (
          value,
        ): value is {
          question: string;
          options: string[];
          allow_multiple?: boolean;
        } => value !== null,
      );

    if (questions.length === 0) {
      return createToolResultMessage(
        toolCall.id,
        "clarification:error:No valid clarification questions provided.",
      );
    }

    const payload = questions.length === 1 ? questions[0] : questions;
    const fenced = `\`\`\`clarification\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    return createToolResultMessage(toolCall.id, fenced);
  }

  if (name === "propose_guided_thread") {
    const args = parseToolArgs<{
      steeringPlanMarkdown?: string;
      threadTitle?: string;
      summary?: string;
      modeId?: string;
      agentPresetId?: string;
    }>(toolCall);

    const steeringPlanMarkdown =
      typeof args.steeringPlanMarkdown === "string"
        ? args.steeringPlanMarkdown.trim()
        : "";

    if (!steeringPlanMarkdown) {
      return createToolResultMessage(
        toolCall.id,
        "guided_thread_offer:error:steeringPlanMarkdown is required.",
      );
    }

    const payload: {
      steeringPlanMarkdown: string;
      threadTitle?: string;
      summary?: string;
      modeId?: string;
      agentPresetId?: string;
    } = {
      steeringPlanMarkdown,
    };

    if (typeof args.threadTitle === "string" && args.threadTitle.trim()) {
      payload.threadTitle = args.threadTitle.trim();
    }
    if (typeof args.summary === "string" && args.summary.trim()) {
      payload.summary = args.summary.trim();
    }
    if (typeof args.modeId === "string" && args.modeId.trim()) {
      payload.modeId = args.modeId.trim();
    }
    if (typeof args.agentPresetId === "string" && args.agentPresetId.trim()) {
      payload.agentPresetId = args.agentPresetId.trim();
    }

    const fenced = `\`\`\`guided_thread_offer\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    return createToolResultMessage(toolCall.id, fenced);
  }

  if (name === "glossary_add") {
    const args = parseToolArgs<{ term?: string; definition?: string }>(
      toolCall,
    );
    const term = typeof args.term === "string" ? args.term : "";
    const definition =
      typeof args.definition === "string" ? args.definition : "";
    const entry = await addGlossaryEntry(projectRoot, term, definition);
    return createToolResultMessage(
      toolCall.id,
      `glossary_add:success:${entry.term}`,
    );
  }

  if (name === "write_file") {
    const args = parseToolArgs<{
      path?: string;
      content?: string;
      description?: string;
    }>(toolCall);
    const relativePath = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const description =
      typeof args.description === "string" && args.description.trim()
        ? args.description.trim()
        : "Datei aktualisiert";

    const result = await writeProjectFile(projectRoot, relativePath, content);
    const kind = result.isNew ? "new" : "modified";

    return createToolResultMessage(
      toolCall.id,
      `write_file:success:${result.snapshotId}:${kind}:${result.path}:${description}`,
    );
  }

  return createToolResultMessage(toolCall.id, `Unknown tool: ${name}`);
}

export async function executeToolCalls(
  projectRoot: string | null,
  toolCalls: ChatToolCall[],
): Promise<ChatToolExecutionResult> {
  const root = ensureProjectRoot(projectRoot);
  const normalizedCalls = Array.isArray(toolCalls) ? toolCalls : [];

  if (normalizedCalls.length === 0) {
    throw new Error("No tool calls provided.");
  }

  const assistantToolCallMessage = createAssistantToolCallMessage(
    normalizedCalls[0],
  );
  if (normalizedCalls.length > 1) {
    assistantToolCallMessage.toolCalls = normalizedCalls.map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type,
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    }));
  }

  const toolResultMessages: Array<{
    role: "tool";
    toolCallId: string;
    content: string;
    hidden?: boolean;
  }> = [];

  for (const toolCall of normalizedCalls) {
    try {
      toolResultMessages.push(await executeSingleToolCall(root, toolCall));
    } catch (error) {
      toolResultMessages.push(
        createToolResultMessage(
          toolCall.id,
          error instanceof Error ? error.message : "Tool execution failed",
        ),
      );
    }
  }

  return {
    assistantToolCallMessage,
    toolResultMessages,
  };
}

export function describeToolCall(toolCall: ChatToolCall): string {
  const name = toolCall.function.name;
  const rawArgs = toolCall.function.arguments ?? "";

  try {
    const args = JSON.parse(rawArgs) as Record<string, unknown>;

    if (name === "read_file" && typeof args.path === "string") {
      return `Lese Datei: ${args.path}`;
    }
    if (name === "search_project" && typeof args.query === "string") {
      return `Suche im Projekt: ${args.query}`;
    }
    if (name === "wiki_read" && typeof args.path === "string") {
      return `Lese Wiki-Datei: ${args.path}`;
    }
    if (name === "wiki_search" && typeof args.query === "string") {
      return `Suche im Wiki: ${args.query}`;
    }
    if (name === "glossary_add" && typeof args.term === "string") {
      return `Glossar-Eintrag anlegen: ${args.term}`;
    }
    if (name === "write_file" && typeof args.path === "string") {
      return `Schreibe Datei: ${args.path}`;
    }
    if (name === "ask_clarification") {
      return "Stelle Rückfrage";
    }
    if (name === "propose_guided_thread") {
      return "Biete Guided Thread an";
    }
  } catch {
    // ignore malformed args for description fallback
  }

  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "propose_guided_thread") return "Biete Guided Thread an";
  return `Führe Tool aus: ${name}`;
}
