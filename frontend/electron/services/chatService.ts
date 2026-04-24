import type { ChatRequest, ChatMessage, ToolCall } from "../../src/types.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProjectModes } from "./projectConfigService.js";

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
}

export type ChatStreamEvent =
  | {
      type: "context";
      data: {
        includedFiles: string[];
        estimatedTokens: number;
        maxContextTokens?: number;
      };
    }
  | { type: "token"; data: string }
  | { type: "tool_call"; data: string }
  | { type: "tool_history"; data: ChatMessage[] }
  | { type: "resolved_user_message"; data: string }
  | { type: "context_update"; data: { estimatedTokens: number } }
  | { type: "done"; data: { fullAssistantText: string } }
  | { type: "error"; data: { message: string } };

export interface ChatStreamStartResult {
  streamId: string;
}

interface PreviewBuildContext {
  projectPath: string | null;
  projectConfig?: ProjectConfigData | null;
}

interface AiProvider {
  id: string;
  name: string;
  fastApiUrl: string;
  fastApiKey: string;
  fastModel: string;
  reasoningApiUrl?: string;
  reasoningApiKey?: string;
  reasoningModel?: string;
  maxTokens?: number;
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAiStreamChunkChoiceDelta {
  content?: string;
}

interface OpenAiStreamChunkChoice {
  delta?: OpenAiStreamChunkChoiceDelta;
  finish_reason?: string | null;
}

interface OpenAiStreamChunk {
  choices?: OpenAiStreamChunkChoice[];
}

interface StreamSessionState {
  aborted: boolean;
}

interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  description: string;
  result: string;
}

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

const TOOLKIT_TOOL_DEFINITIONS: Record<string, ToolDefinition[]> = {
  dateisystem: [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a project file by relative path.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_project",
        description: "Search text in project files.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write a file inside the current project.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
  ],
  wiki: [
    {
      type: "function",
      function: {
        name: "wiki_read",
        description: "Read a wiki markdown file by relative path inside wiki/.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "wiki_search",
        description: "Search inside wiki markdown files.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
  ],
  glossary: [
    {
      type: "function",
      function: {
        name: "glossary_add",
        description: "Add a term to the local glossary.",
        parameters: {
          type: "object",
          properties: {
            term: { type: "string" },
            definition: { type: "string" },
          },
          required: ["term", "definition"],
        },
      },
    },
  ],
  assistant: [
    {
      type: "function",
      function: {
        name: "ask_clarification",
        description:
          "Ask the user one or more clarifying questions before proceeding.",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["question", "options"],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_guided_thread",
        description:
          "Propose a guided follow-up thread with a steering plan for structured work.",
        parameters: {
          type: "object",
          properties: {
            steeringPlanMarkdown: { type: "string" },
            threadTitle: { type: "string" },
            summary: { type: "string" },
            modeId: { type: "string" },
            agentPresetId: { type: "string" },
          },
          required: ["steeringPlanMarkdown"],
        },
      },
    },
  ],
};

const streamSessions = new Map<string, StreamSessionState>();

const AI_PROVIDERS_FILE = "ai-providers.json";
const DEFAULT_PROVIDER_ID = "default";

function getAppDataDir(): string {
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  return path.join(os.homedir(), ".writing-assistant");
}

function getAiProvidersPath(): string {
  return path.join(getAppDataDir(), AI_PROVIDERS_FILE);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadAiProviders(): Promise<AiProvider[]> {
  const providers = await readJsonFile<AiProvider[]>(getAiProvidersPath());
  if (!Array.isArray(providers)) {
    return [];
  }
  return providers.filter(
    (provider) =>
      provider &&
      typeof provider.id === "string" &&
      typeof provider.name === "string",
  );
}

async function resolveAiProvider(
  llmId: string | null | undefined,
): Promise<AiProvider> {
  const providers = await loadAiProviders();
  const trimmedId = normalizeText(llmId);

  if (trimmedId) {
    const found = providers.find((provider) => provider.id === trimmedId);
    if (found) {
      return found;
    }
    throw new Error(`AI provider not found: ${trimmedId}`);
  }

  const first = providers[0];
  if (first) {
    return first;
  }

  const envApiUrl = normalizeText(process.env.AI_API_URL);
  const envApiKey = normalizeText(process.env.AI_API_KEY);
  const envModel = normalizeText(process.env.AI_MODEL);

  if (!envApiUrl || !envApiKey || !envModel) {
    throw new Error(
      "No AI provider configured. Add one in settings or configure AI_API_URL, AI_API_KEY and AI_MODEL.",
    );
  }

  return {
    id: DEFAULT_PROVIDER_ID,
    name: "Default",
    fastApiUrl: envApiUrl,
    fastApiKey: envApiKey,
    fastModel: envModel,
    maxTokens: undefined,
  };
}

function resolveProviderEndpoint(
  provider: AiProvider,
  useReasoning: boolean | undefined,
): { apiUrl: string; apiKey: string; model: string; maxTokens?: number } {
  const wantsReasoning = useReasoning === true;
  const hasReasoning =
    normalizeText(provider.reasoningApiUrl) &&
    normalizeText(provider.reasoningApiKey) &&
    normalizeText(provider.reasoningModel);

  if (wantsReasoning && hasReasoning) {
    return {
      apiUrl: normalizeText(provider.reasoningApiUrl),
      apiKey: normalizeText(provider.reasoningApiKey),
      model: normalizeText(provider.reasoningModel),
      maxTokens: provider.maxTokens,
    };
  }

  const apiUrl = normalizeText(provider.fastApiUrl);
  const apiKey = normalizeText(provider.fastApiKey);
  const model = normalizeText(provider.fastModel);

  if (!apiUrl || !apiKey || !model) {
    throw new Error(
      `AI provider "${provider.name}" is incomplete. Fast URL, key and model are required.`,
    );
  }

  return {
    apiUrl,
    apiKey,
    model,
    maxTokens: provider.maxTokens,
  };
}

function ensureChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function buildOpenAiMessages(
  request: ChatRequest,
  systemPrompt: string,
): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  const history = Array.isArray(request.history) ? request.history : [];
  for (const message of history) {
    if (message.hidden) continue;

    if (message.role === "assistant") {
      const content =
        typeof message.content === "string" ? message.content.trim() : "";
      const toolCalls = Array.isArray(message.toolCalls)
        ? message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          }))
        : undefined;

      if (!content && (!toolCalls || toolCalls.length === 0)) continue;

      messages.push({
        role: "assistant",
        content,
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (message.role === "tool") {
      const content =
        typeof message.content === "string" ? message.content.trim() : "";
      if (!content || !message.toolCallId) continue;

      messages.push({
        role: "tool",
        content,
        tool_call_id: message.toolCallId,
      });
      continue;
    }

    if (message.role === "user" || message.role === "system") {
      const content =
        typeof message.content === "string" ? message.content.trim() : "";
      if (!content) continue;

      messages.push({
        role: message.role,
        content,
      });
    }
  }

  const finalUserMessage = normalizeText(request.message);
  if (finalUserMessage) {
    messages.push({
      role: "user",
      content: finalUserMessage,
    });
  }

  return messages;
}

function extractContentToken(chunk: OpenAiStreamChunk): string {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  const delta = choice?.delta;
  return typeof delta?.content === "string" ? delta.content : "";
}

function extractFinishReason(chunk: OpenAiStreamChunk): string | null {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  return typeof choice?.finish_reason === "string"
    ? choice.finish_reason
    : null;
}

function buildClarificationFence(
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

  if (normalizedQuestions.length === 0) {
    return null;
  }

  return {
    text: `\`\`\`clarification\n${JSON.stringify(
      normalizedQuestions,
      null,
      2,
    )}\n\`\`\``,
    normalizedQuestions,
  };
}

function buildGuidedThreadOfferFence(args: {
  steeringPlanMarkdown?: unknown;
  threadTitle?: unknown;
  summary?: unknown;
  modeId?: unknown;
  agentPresetId?: unknown;
}): string | null {
  const steeringPlanMarkdown =
    typeof args.steeringPlanMarkdown === "string"
      ? args.steeringPlanMarkdown.trim()
      : "";
  if (!steeringPlanMarkdown) {
    return null;
  }

  const payload: Record<string, string> = {
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

  return `\`\`\`guided_thread_offer\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function makeToolCallId(index: number): string {
  return `tool-call-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function ensureProjectPath(projectPath: string | null): string {
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  return projectPath;
}

function resolveProjectPath(
  projectPath: string | null,
  relativePath: string,
): string {
  const root = ensureProjectPath(projectPath);
  const normalized = normalizeText(relativePath).replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const resolved = path.resolve(root, ...segments);
  const relativeToRoot = path.relative(root, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return resolved;
}

async function readProjectFile(
  projectPath: string | null,
  relativePath: string,
): Promise<string> {
  const targetPath = resolveProjectPath(projectPath, relativePath);
  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }
  return fs.readFile(targetPath, "utf8");
}

async function searchProject(
  projectPath: string | null,
  query: string,
  limit = 20,
): Promise<Array<{ path: string; snippet: string }>> {
  const root = ensureProjectPath(projectPath);
  const trimmedQuery = normalizeText(query).toLowerCase();
  if (!trimmedQuery) return [];

  const results: Array<{ path: string; snippet: string }> = [];

  async function walk(currentPath: string): Promise<void> {
    if (results.length >= limit) return;

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.name === ".git" || entry.name === "node_modules") continue;

      const absPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;

      let content = "";
      try {
        content = await fs.readFile(absPath, "utf8");
      } catch {
        continue;
      }

      const haystack = content.toLowerCase();
      const index = haystack.indexOf(trimmedQuery);
      if (index < 0) continue;

      const compact = content.replace(/\s+/g, " ").trim();
      const compactLower = compact.toLowerCase();
      const compactIndex = compactLower.indexOf(trimmedQuery);
      const start = Math.max(0, compactIndex - 60);
      const end = Math.min(
        compact.length,
        compactIndex + trimmedQuery.length + 120,
      );
      const snippet = `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;

      results.push({
        path: path.relative(root, absPath).split(path.sep).join("/"),
        snippet,
      });
    }
  }

  await walk(root);
  return results;
}

async function listWikiMarkdownFiles(
  projectPath: string | null,
): Promise<string[]> {
  const wikiRoot = resolveProjectPath(projectPath, "wiki");
  try {
    const stat = await fs.stat(wikiRoot);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const files: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md"))
        continue;
      files.push(path.relative(wikiRoot, absPath).split(path.sep).join("/"));
    }
  }

  await walk(wikiRoot);
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return files;
}

async function readWikiFile(
  projectPath: string | null,
  relativePath: string,
): Promise<string> {
  const wikiRoot = resolveProjectPath(projectPath, "wiki");
  const normalized = normalizeText(relativePath).replace(/\\/g, "/");
  const targetPath = path.resolve(
    wikiRoot,
    ...normalized.split("/").filter(Boolean),
  );
  const relativeToRoot = path.relative(wikiRoot, targetPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Wiki path escapes wiki root: ${relativePath}`);
  }
  if (!targetPath.toLowerCase().endsWith(".md")) {
    throw new Error("Wiki only supports Markdown files.");
  }
  return fs.readFile(targetPath, "utf8");
}

async function searchWikiFiles(
  projectPath: string | null,
  query: string,
  limit = 10,
): Promise<Array<{ path: string; snippet: string }>> {
  const trimmedQuery = normalizeText(query).toLowerCase();
  if (!trimmedQuery) return [];

  const files = await listWikiMarkdownFiles(projectPath);
  const results: Array<{ path: string; snippet: string }> = [];

  for (const relativePath of files) {
    if (results.length >= limit) break;
    const content = await readWikiFile(projectPath, relativePath);
    const compact = content.replace(/\s+/g, " ").trim();
    const index = compact.toLowerCase().indexOf(trimmedQuery);
    if (index < 0) continue;

    const start = Math.max(0, index - 60);
    const end = Math.min(compact.length, index + trimmedQuery.length + 120);
    results.push({
      path: relativePath,
      snippet: `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`,
    });
  }

  return results;
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
  const next = existing.trim()
    ? `${existing.trim()}\n${entry}\n`
    : `${entry}\n`;
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
  try {
    await fs.access(targetPath);
  } catch {
    existed = false;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");

  const relative = normalizeText(filePath).replace(/\\/g, "/");
  return `write_file:success:local-${Date.now()}:${existed ? "modified" : "new"}:${relative}:Updated via local chat tool`;
}

function describeStreamingToolCall(toolCall: ToolCall): string {
  const name = toolCall.function.name;
  if (name === "read_file") return "Lese Datei";
  if (name === "search_project") return "Suche im Projekt";
  if (name === "wiki_read") return "Lese Wiki-Datei";
  if (name === "wiki_search") return "Suche im Wiki";
  if (name === "glossary_add") return "Ergänze Glossar";
  if (name === "write_file") return "Schreibe Datei";
  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "propose_guided_thread") return "Biete Guided Thread an";
  return `Tool: ${name}`;
}

async function executeToolCall(
  projectPath: string | null,
  toolCall: ToolCall,
): Promise<ToolExecutionResult> {
  const name = toolCall.function.name;
  const args =
    safeJsonParse<Record<string, unknown>>(toolCall.function.arguments) ?? {};

  let result = "";
  if (name === "read_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    result = await readProjectFile(projectPath, filePath);
  } else if (name === "search_project") {
    const query = normalizeText(String(args.query ?? ""));
    const limit = typeof args.limit === "number" ? Math.round(args.limit) : 20;
    result = JSON.stringify(await searchProject(projectPath, query, limit));
  } else if (name === "wiki_read") {
    const filePath = normalizeText(String(args.path ?? ""));
    result = await readWikiFile(projectPath, filePath);
  } else if (name === "wiki_search") {
    const query = normalizeText(String(args.query ?? ""));
    const limit = typeof args.limit === "number" ? Math.round(args.limit) : 10;
    result = JSON.stringify(await searchWikiFiles(projectPath, query, limit));
  } else if (name === "glossary_add") {
    const term = normalizeText(String(args.term ?? ""));
    const definition = normalizeText(String(args.definition ?? ""));
    result = await addGlossaryEntryLocally(projectPath, term, definition);
  } else if (name === "write_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    const content = typeof args.content === "string" ? args.content : "";
    result = await writeProjectFile(projectPath, filePath, content);
  } else if (name === "ask_clarification") {
    const clarification = buildClarificationFence(args.questions ?? args);
    if (!clarification) {
      throw new Error(
        "ask_clarification requires at least one valid question.",
      );
    }
    result = clarification.text;
  } else if (name === "propose_guided_thread") {
    const offer = buildGuidedThreadOfferFence({
      steeringPlanMarkdown: args.steeringPlanMarkdown,
      threadTitle: args.threadTitle,
      summary: args.summary,
      modeId: args.modeId,
      agentPresetId: args.agentPresetId,
    });
    if (!offer) {
      throw new Error("propose_guided_thread requires steeringPlanMarkdown.");
    }
    result = offer;
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

function extractToolCalls(chunk: OpenAiStreamChunk): ToolCall[] {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  const rawToolCalls = (
    choice as
      | { delta?: { tool_calls?: Array<Record<string, unknown>> } }
      | undefined
  )?.delta?.tool_calls;
  if (!Array.isArray(rawToolCalls)) return [];

  return rawToolCalls
    .map((entry, index) => {
      const functionPayload =
        entry && typeof entry === "object" && typeof entry.function === "object"
          ? (entry.function as Record<string, unknown>)
          : {};
      const name = normalizeText(String(functionPayload.name ?? ""));
      const argumentsJson =
        typeof functionPayload.arguments === "string"
          ? functionPayload.arguments
          : "";
      if (!name) return null;
      return {
        id:
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id
            : makeToolCallId(index),
        type: "function",
        function: {
          name,
          arguments: argumentsJson,
        },
      } satisfies ToolCall;
    })
    .filter((value): value is ToolCall => value !== null);
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveModeSystemPrompt(
  projectPath: string | null,
  modeId: string,
): Promise<string> {
  const id = normalizeText(modeId);
  if (!id) return "";
  const modes = await getProjectModes(projectPath);
  const found = modes.find((m) => m.id === id);
  return normalizeText(found?.systemPrompt ?? "");
}

function estimateTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function buildModeBlock(request: ChatRequest): ContextBlock | null {
  const mode = normalizeText(request.mode);
  if (!mode) return null;

  const content = `Aktiver Chat-Modus: ${mode}`;
  return {
    type: "mode",
    label: "Chat-Modus",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function buildMessageBlock(request: ChatRequest): ContextBlock | null {
  const message = typeof request.message === "string" ? request.message : "";
  if (!message.trim()) return null;

  return {
    type: "message",
    label: "Nachricht",
    content: message,
    estimatedTokens: estimateTokens(message),
  };
}

function buildHistoryBlock(request: ChatRequest): ContextBlock | null {
  const history = Array.isArray(request.history) ? request.history : [];
  if (history.length === 0) return null;

  const content = history
    .filter((message) => !message.hidden)
    .map(formatHistoryMessage)
    .filter(Boolean)
    .join("\n\n");

  if (!content) return null;

  return {
    type: "history",
    label: "Verlauf",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function formatHistoryMessage(message: ChatMessage): string {
  const role = normalizeText(message.role);
  const content =
    typeof message.content === "string" ? message.content.trim() : "";
  if (!role || !content) return "";
  return `${role.toUpperCase()}: ${content}`;
}

function buildToolkitBlock(request: ChatRequest): ContextBlock | null {
  if (request.quickChat) return null;

  const disabled = new Set(
    Array.isArray(request.disabledToolkits)
      ? request.disabledToolkits.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  );
  const allToolkits = Object.keys(TOOLKIT_TOOL_DEFINITIONS);
  const activeToolkits = allToolkits.filter((id) => !disabled.has(id));
  const disabledToolkits = allToolkits.filter((id) => disabled.has(id));

  const lines: string[] = [];
  if (activeToolkits.length > 0) {
    lines.push(`Aktive Toolkits: ${activeToolkits.join(", ")}`);
  }
  if (disabledToolkits.length > 0) {
    lines.push(`Deaktivierte Toolkits: ${disabledToolkits.join(", ")}`);
  }

  if (lines.length === 0) return null;

  const content = lines.join("\n");
  return {
    type: "toolkits",
    label: "Toolkits",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function buildSessionBlock(request: ChatRequest): ContextBlock | null {
  const sessionKind = normalizeText(request.sessionKind);
  const steeringPlan =
    typeof request.steeringPlan === "string" ? request.steeringPlan.trim() : "";

  if (!sessionKind && !steeringPlan) return null;

  const lines: string[] = [];
  if (sessionKind) {
    lines.push(`Sitzungstyp: ${sessionKind}`);
  }
  if (steeringPlan) {
    lines.push("Steuerungsplan:");
    lines.push(steeringPlan);
  }

  const content = lines.join("\n");
  return {
    type: "session",
    label: "Sitzung",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function getActiveToolDefinitions(request: ChatRequest): ToolDefinition[] {
  if (request.quickChat) return [];
  const disabled = new Set(
    Array.isArray(request.disabledToolkits)
      ? request.disabledToolkits.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  );
  return Object.entries(TOOLKIT_TOOL_DEFINITIONS)
    .filter(([toolkitId]) => !disabled.has(toolkitId))
    .flatMap(([, tools]) => tools);
}

function buildSystemPrompt(
  request: ChatRequest,
  context: PreviewBuildContext,
  modeSystemPrompt: string,
): string {
  const sections: string[] = [];

  // 1. Core mode instructions
  const modeGuidance = normalizeText(modeSystemPrompt);
  if (modeGuidance) {
    sections.push(modeGuidance);
  } else if (request.quickChat) {
    sections.push(
      "Du bist ein hilfreicher Assistent. Antworte präzise und sachlich.",
    );
  } else {
    sections.push(
      "Du arbeitest in einer lokalen Electron-Anwendung mit bereitgestelltem Projektkontext. Antworte sachlich und hilfreich.",
    );
  }

  // 2. Current date
  sections.push(
    `Heutiges Datum: ${new Date().toISOString().slice(0, 10)}`,
  );

  // 3. Project context (non-quickChat only)
  if (!request.quickChat) {
    const projectLines: string[] = [];
    if (context.projectPath) {
      projectLines.push(`Projektpfad: ${context.projectPath}`);
    }
    if (context.projectConfig?.name) {
      projectLines.push(`Projektname: ${context.projectConfig.name}`);
    }
    if (context.projectConfig?.description) {
      projectLines.push(`Beschreibung: ${context.projectConfig.description}`);
    }
    if (context.projectConfig?.workspaceMode) {
      projectLines.push(
        `Workspace-Modus: ${context.projectConfig.workspaceMode}`,
      );
    }
    const alwaysInclude = context.projectConfig?.alwaysInclude ?? [];
    if (alwaysInclude.length > 0) {
      projectLines.push(
        `Immer-enthaltene Dateien: ${alwaysInclude.join(", ")}`,
      );
    }
    const mode = normalizeText(request.mode);
    if (mode) {
      projectLines.push(`Aktiver Modus: ${mode}`);
    }
    const referencedFiles = Array.isArray(request.referencedFiles)
      ? request.referencedFiles
          .map((value) => normalizeText(value))
          .filter(Boolean)
      : [];
    if (referencedFiles.length > 0) {
      projectLines.push(`Referenzierte Dateien: ${referencedFiles.join(", ")}`);
    }
    if (projectLines.length > 0) {
      sections.push(projectLines.join("\n"));
    }
  }

  // 4. Active tools
  if (!request.quickChat) {
    const activeTools = getActiveToolDefinitions(request);
    if (activeTools.length > 0) {
      const toolNames = activeTools.map((t) => t.function.name).join(", ");
      sections.push(`Verfügbare Werkzeuge: ${toolNames}`);
    }
  }

  // 5. Guided session & steering plan
  if (request.sessionKind === "guided") {
    const guidedLines = [
      "Sitzungstyp: Geführte Sitzung (guided). Führe den Nutzer aktiv durch die Aufgabe und halte dich an den Steuerungsplan.",
    ];
    const steeringPlan = normalizeText(request.steeringPlan ?? "");
    if (steeringPlan) {
      guidedLines.push(`Steuerungsplan:\n${steeringPlan}`);
    }
    sections.push(guidedLines.join("\n"));
  }

  // 6. Reasoning hint
  if (request.useReasoning) {
    sections.push(
      "Reasoning ist aktiviert. Denke Schritt für Schritt nach, bevor du antwortest.",
    );
  }

  return sections.join("\n\n");
}

interface ProjectConfigData {
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getAssistantDir(projectPath: string): string {
  return path.join(projectPath, ".assistant");
}

function getProjectConfigPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), "project.json");
}

function getGlossaryPath(projectPath: string): string {
  return path.join(getAssistantDir(projectPath), "glossary.md");
}

async function readProjectConfig(
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
      config.extraFeatures && typeof config.extraFeatures === "object"
        ? config.extraFeatures
        : undefined,
  };
}

async function readGlossaryContent(
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

async function buildFileTreeListing(
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

function sliceByLineRange(
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

async function readReferencedProjectFile(
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
    return {
      path: trimmed,
      content,
    };
  } catch {
    return null;
  }
}

function createContextBlock(
  type: string,
  label: string,
  content: string,
): ContextBlock | null {
  const normalized = content.trim();
  if (!normalized) return null;
  return {
    type,
    label,
    content: normalized,
    estimatedTokens: estimateTokens(normalized),
  };
}

async function buildPreviewContext(
  projectPath: string | null,
  request: ChatRequest,
): Promise<{
  projectConfig: ProjectConfigData | null;
  blocks: ContextBlock[];
  includedFiles: string[];
}> {
  const blocks: ContextBlock[] = [];
  const includedFiles = new Set<string>();

  const projectConfig = await readProjectConfig(projectPath);

  const modeBlock = buildModeBlock(request);
  if (modeBlock) blocks.push(modeBlock);

  if (projectConfig?.workspaceMode) {
    const workspaceModeBlock = createContextBlock(
      "workspace-mode",
      "Workspace Mode",
      projectConfig.workspaceMode,
    );
    if (workspaceModeBlock) blocks.push(workspaceModeBlock);
  }

  const glossaryContent = await readGlossaryContent(projectPath);
  const glossaryBlock = createContextBlock(
    "glossary",
    "Glossary (.assistant/glossary.md)",
    glossaryContent,
  );
  if (glossaryBlock) blocks.push(glossaryBlock);

  if (projectPath) {
    const treeLines = await buildFileTreeListing(projectPath, projectPath);
    const fileTreeBlock = createContextBlock(
      "file-tree",
      "Project Files (tree)",
      treeLines.join("\n"),
    );
    if (fileTreeBlock) blocks.push(fileTreeBlock);
  }

  const alwaysInclude = projectConfig?.alwaysInclude ?? [];
  for (const relativePath of alwaysInclude) {
    const referenced = await readReferencedProjectFile(
      projectPath,
      relativePath,
    );
    if (!referenced) continue;
    includedFiles.add(relativePath);
    const fileBlock = createContextBlock(
      "file",
      relativePath,
      referenced.content,
    );
    if (fileBlock) blocks.push(fileBlock);
  }

  const referencedFiles = Array.isArray(request.referencedFiles)
    ? request.referencedFiles
        .map((value) => normalizeText(value))
        .filter(Boolean)
    : [];

  for (const reference of referencedFiles) {
    if (includedFiles.has(reference)) continue;
    const fileData = await readReferencedProjectFile(projectPath, reference);
    if (!fileData) continue;
    includedFiles.add(reference);
    const referencedBlock = createContextBlock(
      "file",
      `Referenced: ${reference}`,
      fileData.content,
    );
    if (referencedBlock) blocks.push(referencedBlock);
  }

  const historyBlock = buildHistoryBlock(request);
  if (historyBlock) blocks.push(historyBlock);

  const messageBlock = buildMessageBlock(request);
  if (messageBlock) blocks.push(messageBlock);

  const toolkitBlock = buildToolkitBlock(request);
  if (toolkitBlock) blocks.push(toolkitBlock);

  const sessionBlock = buildSessionBlock(request);
  if (sessionBlock) blocks.push(sessionBlock);

  return {
    projectConfig,
    blocks,
    includedFiles: [...includedFiles],
  };
}

function createStreamId(): string {
  return `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStreamActive(streamId: string): boolean {
  return streamSessions.get(streamId)?.aborted !== true;
}

export async function previewChatContext(
  projectPath: string | null,
  request: ChatRequest,
): Promise<ChatContextPreviewResult> {
  console.debug(
    `[chat] previewChatContext: mode=${normalizeText(request.mode)}, project=${projectPath ?? "(none)"}`,
  );
  const previewContext = await buildPreviewContext(projectPath, request);

  const context: PreviewBuildContext = {
    projectPath,
    projectConfig: previewContext.projectConfig,
  };

  const modeSystemPrompt = await resolveModeSystemPrompt(
    projectPath,
    request.mode,
  );
  const systemPrompt = buildSystemPrompt(request, context, modeSystemPrompt);
  console.debug(
    `[chat] previewChatContext: done (systemPrompt=${systemPrompt.length} chars, modeSystemPrompt=${modeSystemPrompt.length} chars)`,
  );
  const estimatedTokens =
    estimateTokens(systemPrompt) +
    previewContext.blocks.reduce(
      (sum, block) => sum + block.estimatedTokens,
      0,
    );

  return {
    includedFiles: previewContext.includedFiles,
    estimatedTokens,
    contextBlocks: previewContext.blocks,
    systemPrompt,
  };
}

export function startChatStream(
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): ChatStreamStartResult {
  const streamId = createStreamId();
  streamSessions.set(streamId, { aborted: false });

  void runChatStream(streamId, projectPath, request, emit);

  return { streamId };
}

export function stopChatStream(streamId: string): { status: string } {
  const session = streamSessions.get(streamId);
  if (!session) {
    return { status: "ok" };
  }

  session.aborted = true;
  streamSessions.delete(streamId);
  return { status: "ok" };
}

async function runChatStream(
  streamId: string,
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  try {
    const provider = await resolveAiProvider(request.llmId);
    const endpoint = resolveProviderEndpoint(provider, request.useReasoning);
    const preview = await previewChatContext(projectPath, request);

    if (!isStreamActive(streamId)) return;

    emit({
      type: "context",
      data: {
        includedFiles: preview.includedFiles,
        estimatedTokens: preview.estimatedTokens,
        maxContextTokens: endpoint.maxTokens,
      },
    });

    if (request.message && request.message.trim()) {
      emit({
        type: "resolved_user_message",
        data: request.message,
      });
    }

    emit({
      type: "context_update",
      data: { estimatedTokens: preview.estimatedTokens },
    });

    let conversationMessages = buildOpenAiMessages(
      request,
      preview.systemPrompt,
    );
    let toolRound = 0;
    let tokenCount = 0;
    let fullAssistantText = "";

    while (toolRound < 3) {
      if (!isStreamActive(streamId)) return;

      const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: endpoint.model,
          stream: true,
          messages: conversationMessages,
          ...(getActiveToolDefinitions(request).length > 0
            ? { tools: getActiveToolDefinitions(request) }
            : {}),
        }),
      });

      if (!response.ok) {
        let detail = `Chat error: ${response.status}`;
        try {
          const body = await response.text();
          if (body) {
            detail += ` — ${body}`;
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let roundAssistantText = "";
      const collectedToolCalls = new Map<string, ToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isStreamActive(streamId)) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.substring(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) {
            continue;
          }

          const data = line.substring(5).trim();
          if (!data) {
            continue;
          }

          if (data === "[DONE]") {
            currentEvent = "";
            continue;
          }

          if (currentEvent === "error") {
            throw new Error(data);
          }

          let parsed: OpenAiStreamChunk | null = null;
          try {
            parsed = JSON.parse(data) as OpenAiStreamChunk;
          } catch {
            parsed = null;
          }

          if (!parsed) {
            currentEvent = "";
            continue;
          }

          const token = extractContentToken(parsed);
          if (token) {
            tokenCount += 1;
            roundAssistantText += token;
            fullAssistantText += token;
            emit({
              type: "token",
              data: token,
            });
          }

          const parsedToolCalls = extractToolCalls(parsed);
          for (const toolCall of parsedToolCalls) {
            collectedToolCalls.set(toolCall.id, toolCall);
          }

          const finishReason = extractFinishReason(parsed);
          if (finishReason === "tool_calls") {
            break;
          }

          currentEvent = "";
        }
      }

      const toolCalls = [...collectedToolCalls.values()];

      if (toolCalls.length === 0) {
        if (!isStreamActive(streamId)) return;

        if (tokenCount === 0 && !roundAssistantText.trim()) {
          emit({
            type: "error",
            data: { message: "MODEL_EMPTY_RESPONSE" },
          });
          return;
        }

        emit({
          type: "done",
          data: { fullAssistantText },
        });
        return;
      }

      const assistantMessageForTools: ChatMessage = {
        role: "assistant",
        content: roundAssistantText,
        toolCalls,
        hidden: true,
      };

      for (const toolCall of toolCalls) {
        emit({
          type: "tool_call",
          data: describeStreamingToolCall(toolCall),
        });
      }

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        executedResults.push(await executeToolCall(projectPath, toolCall));
      }

      const toolHistoryMessages: ChatMessage[] = [
        assistantMessageForTools,
        ...executedResults.map((result) => ({
          role: "tool" as const,
          toolCallId: result.toolCallId,
          content: result.result,
          hidden: false,
        })),
      ];

      emit({
        type: "tool_history",
        data: toolHistoryMessages,
      });

      conversationMessages.push({
        role: "assistant",
        content: roundAssistantText,
        tool_calls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      });

      for (const result of executedResults) {
        conversationMessages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.result,
        });
      }

      toolRound += 1;
    }

    if (!isStreamActive(streamId)) return;

    emit({
      type: "done",
      data: { fullAssistantText },
    });
  } catch (error) {
    if (!isStreamActive(streamId)) return;

    emit({
      type: "error",
      data: {
        message: error instanceof Error ? error.message : "CHAT_STREAM_FAILED",
      },
    });
  } finally {
    streamSessions.delete(streamId);
  }
}
