import type { ChatRequest, ChatMessage, ToolCall } from "../../src/types.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizeText,
  estimateTokens,
  readJsonFile,
  ensureProjectPath,
  resolveProjectPath,
  type PreviewBuildContext,
} from "./conversation/projectContext.js";
import {
  buildPreviewContext,
  type ContextBlock,
} from "./conversation/contextBlocks.js";
import {
  buildSystemPrompt,
  getActiveToolDefinitions,
  resolveModeSystemPrompt,
  TOOLKIT_TOOL_DEFINITIONS,
  type ToolDefinition,
} from "./conversation/systemPrompt.js";
import { semanticSearch, type EmbeddingConfig } from "./vectorService.js";
import { createSnapshot } from "./snapshotService.js";
import { appendJournalEntry, appendConflict } from "./journalService.js";
import {
  resolveEmbeddingCredentials,
  type AiProvider,
} from "./aiProviderService.js";
import {
  getNaviState,
  buildClassificationPrompt,
  buildNaviContextPrompt,
  buildStateSummaryPrompt,
  type NaviState,
} from "./naviStateMachine.js";
import { buildNaviKnowledgePrompt } from "./naviKnowledgeBase.js";
import { NAVI_TIPS } from "../../src/naviTips.js";
import { getProjectConfig } from "./projectConfigService.js";

export type { ContextBlock };

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
  maxToolRounds: number;
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
  | { type: "error"; data: { message: string } }
  | { type: "navi_state"; data: { stateId: string; completedStateId?: string; summary?: string } }
  | { type: "navi_plan"; data: { plan: string } }
  | { type: "navi_tips_covered"; data: { coveredIds: string[] } }
  | { type: "navi_problems"; data: { current: string; interpretation?: string; queue: string[] } }
  | { type: "navi_step"; data: { label: string | null } }
  | { type: "navi_context"; data: import("../../src/types.js").NaviContext };

export interface ChatStreamStartResult {
  streamId: string;
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

function normalizeLoadedProvider(raw: unknown): AiProvider | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<AiProvider>;
  if (typeof p.id !== "string" || typeof p.name !== "string") return null;
  const maxTokens =
    typeof p.maxTokens === "number" && Number.isFinite(p.maxTokens)
      ? Math.round(p.maxTokens)
      : undefined;
  return {
    id: p.id,
    name: p.name,
    fastApiUrl: normalizeText(String(p.fastApiUrl ?? "")),
    fastApiKey: normalizeText(String(p.fastApiKey ?? "")),
    fastModel: normalizeText(String(p.fastModel ?? "")),
    reasoningApiUrl: normalizeText(String(p.reasoningApiUrl ?? "")),
    reasoningApiKey: normalizeText(String(p.reasoningApiKey ?? "")),
    reasoningModel: normalizeText(String(p.reasoningModel ?? "")),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

async function loadAiProviders(): Promise<AiProvider[]> {
  const raw = await readJsonFile<unknown[]>(getAiProvidersPath());
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AiProvider[] = [];
  for (const entry of raw) {
    const normalized = normalizeLoadedProvider(entry);
    if (normalized) out.push(normalized);
  }
  return out;
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
    reasoningApiUrl: "",
    reasoningApiKey: "",
    reasoningModel: "",
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

/**
 * Renders the file-type context blocks (referenced/attached + always-included files) into a
 * text block. This is attached to the final user message (not a separate system message):
 * many OpenAI-compatible endpoints drop or ignore a second/late `system` message, and placing
 * the content next to the user's question makes the model actually use it. Without this the
 * model only sees the file *names* from the system prompt — the content would never arrive.
 */
function buildFileContextText(contextBlocks: ContextBlock[]): string | null {
  const fileBlocks = contextBlocks.filter((block) => block.type === "file");
  if (fileBlocks.length === 0) return null;

  const body = fileBlocks
    .map((block) => `### ${block.label}\n${block.content}`)
    .join("\n\n");

  return (
    "[Angehängte Dateien — vom Nutzer als Kontext bereitgestellt. Nutze ihren Inhalt direkt, " +
    "du musst sie nicht erneut über Werkzeuge lesen.]\n\n" +
    body
  );
}

function buildOpenAiMessages(
  request: ChatRequest,
  systemPrompt: string,
  contextBlocks: ContextBlock[] = [],
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

  const fileContextText = buildFileContextText(contextBlocks);
  const finalUserMessage = normalizeText(request.message);
  if (finalUserMessage || fileContextText) {
    const content = [fileContextText, finalUserMessage]
      .filter(Boolean)
      .join("\n\n");
    messages.push({
      role: "user",
      content,
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

function buildThreadResultFence(args: {
  summary?: unknown;
  threadTitle?: unknown;
  updatedFiles?: unknown;
}): string | null {
  const summary =
    typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) return null;

  const payload: Record<string, unknown> = { summary };
  if (typeof args.threadTitle === "string" && args.threadTitle.trim()) {
    payload.threadTitle = args.threadTitle.trim();
  }
  if (Array.isArray(args.updatedFiles) && args.updatedFiles.length > 0) {
    const files = args.updatedFiles.filter(
      (f) => typeof f === "string" && (f as string).trim(),
    );
    if (files.length > 0) payload.updatedFiles = files;
  }

  return `\`\`\`thread_result\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
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
      console.debug(
        `[chat] read_file: no file at "${targetPath}", returning empty string`,
      );
      return "";
    }
    throw e;
  }
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }
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
  let oldContent = "";
  try {
    oldContent = await fs.readFile(targetPath, "utf8");
  } catch {
    existed = false;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");

  const relative = normalizeText(filePath).replace(/\\/g, "/");
  // Record an in-memory snapshot so the chat ChangeCard can show a diff and offer apply/revert.
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
  if (!oldString) {
    throw new Error("edit_file: 'old' must not be empty.");
  }
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
  // Same in-memory snapshot + result format as write_file so the chat shows a diff card.
  const snapshot = createSnapshot(relative, oldContent, false);
  return `write_file:success:${snapshot.id}:modified:${relative}:Datei bearbeitet`;
}

function describeStreamingToolCall(toolCall: ToolCall): string {
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

async function executeToolCall(
  projectPath: string | null,
  toolCall: ToolCall,
  embeddingConfig?: EmbeddingConfig,
): Promise<ToolExecutionResult> {
  const name = toolCall.function.name;
  const args =
    safeJsonParse<Record<string, unknown>>(toolCall.function.arguments) ?? {};

  let result = "";
  if (name === "read_file") {
    const filePath = normalizeText(String(args.path ?? ""));
    result = await readProjectFile(projectPath, filePath);
  } else if (name === "semantic_search") {
    const query = normalizeText(String(args.query ?? ""));
    const limit = typeof args.limit === "number" ? Math.round(args.limit) : 10;
    const rawScope = typeof args.scope === "string" ? args.scope : "all";
    const scope =
      rawScope === "project" || rawScope === "wiki" ? rawScope : "all";
    const root = ensureProjectPath(projectPath);

    if (!embeddingConfig?.apiKey || !embeddingConfig?.apiUrl) {
      result = JSON.stringify({
        error: "No AI provider configured for embeddings.",
      });
    } else {
      const searchResult = await semanticSearch(root, query, embeddingConfig, {
        limit,
        scope,
      });
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
  } else if (name === "report_thread_result") {
    const fence = buildThreadResultFence({
      summary: args.summary,
      threadTitle: args.threadTitle,
      updatedFiles: args.updatedFiles,
    });
    if (!fence) {
      throw new Error("report_thread_result requires a non-empty summary.");
    }
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
    const description = typeof args.description === "string" ? args.description : String(args.description ?? "");
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

/**
 * Accumulates streaming tool call fragments into the given map.
 * In OpenAI's streaming protocol, tool call arguments arrive across many
 * chunks. Only the first chunk carries the id and name; subsequent chunks
 * carry argument fragments that must be concatenated. Entries are keyed by
 * the positional `index` field so they survive across chunks where `id` is
 * absent.
 */
function accumulateToolCallChunks(
  chunk: OpenAiStreamChunk,
  accumulator: Map<number, ToolCall>,
): void {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  const rawToolCalls = (
    choice as
      | { delta?: { tool_calls?: Array<Record<string, unknown>> } }
      | undefined
  )?.delta?.tool_calls;
  if (!Array.isArray(rawToolCalls)) return;

  for (const entry of rawToolCalls) {
    if (!entry || typeof entry !== "object") continue;

    const chunkIndex =
      typeof entry.index === "number" ? entry.index : accumulator.size;

    const functionPayload =
      typeof entry.function === "object" && entry.function !== null
        ? (entry.function as Record<string, unknown>)
        : {};

    const argumentFragment =
      typeof functionPayload.arguments === "string"
        ? functionPayload.arguments
        : "";

    const existing = accumulator.get(chunkIndex);
    if (existing) {
      existing.function.arguments += argumentFragment;
    } else {
      const name = normalizeText(String(functionPayload.name ?? ""));
      const id =
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : makeToolCallId(chunkIndex);
      if (!name) continue;
      accumulator.set(chunkIndex, {
        id,
        type: "function",
        function: { name, arguments: argumentFragment },
      } satisfies ToolCall);
    }
  }
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

  const maxToolRounds =
    typeof previewContext.projectConfig?.maxToolRounds === "number" &&
    previewContext.projectConfig.maxToolRounds >= 1
      ? previewContext.projectConfig.maxToolRounds
      : 30;

  return {
    includedFiles: previewContext.includedFiles,
    estimatedTokens,
    contextBlocks: previewContext.blocks,
    systemPrompt,
    maxToolRounds,
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

const ASK_QUESTION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "ask_question",
    description:
      "Schreibe deine nächste Nachricht im Gespräch. Zeige zuerst in einem kurzen Satz, dass du verstanden hast, was der Händler gerade gesagt hat – dann genau eine gezielte Frage.",
    parameters: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description: "Deine direkte Gesprächsnachricht. Immer 'du', nie 'der Händler'. 1–2 Sätze: erst kurze Reaktion auf das Gesagte, dann eine konkrete Frage.",
        },
      },
      required: ["response"],
    },
  },
};

function buildNaviStateTools(state: NaviState): {
  tools: ToolDefinition[];
  toolChoice: "required" | undefined;
} {
  if (!state.tools || state.tools.length === 0) {
    return { tools: [], toolChoice: undefined };
  }
  const tools: ToolDefinition[] = [];
  for (const name of state.tools) {
    if (name === "ask_question") {
      tools.push(ASK_QUESTION_TOOL);
    } else if (name === "ask_clarification") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find(
        (d) => d.function.name === "ask_clarification",
      );
      if (t) tools.push(t);
    }
  }
  return { tools, toolChoice: tools.length > 0 ? "required" : undefined };
}

async function runNaviChatStream(
  streamId: string,
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  try {
    const provider = await resolveAiProvider(request.llmId);
    const endpoint = resolveProviderEndpoint(provider, false);

    if (!isStreamActive(streamId)) return;

    emit({
      type: "context",
      data: {
        includedFiles: [],
        estimatedTokens: 0,
        maxContextTokens: endpoint.maxTokens,
      },
    });

    const userMessage = normalizeText(request.message);
    if (userMessage) {
      emit({ type: "resolved_user_message", data: userMessage });
    }

    const currentStateId =
      normalizeText(request.naviStateId ?? "") || "greeting";
    const currentState =
      getNaviState(currentStateId) ?? getNaviState("greeting")!;

    // Load project config once — used for instruction and workPlan overrides throughout.
    let projConfig: import("../../src/types.js").ProjectConfig | null = null;
    try {
      projConfig = await getProjectConfig(projectPath);
    } catch {
      // Non-fatal: fall back to defaults
    }

    const effectiveWorkPlan = (stateId: string, base: string[]): string[] => {
      const override = projConfig?.naviWorkPlans?.[stateId];
      return Array.isArray(override) && override.length > 0 ? override : base;
    };

    let newStateId = currentStateId;

    // Call 1: Classification — skip if no user message or no transitions
    if (userMessage && currentState.transitions.length > 0) {
      emit({ type: "navi_step", data: { label: "Prüfe Phasenwechsel …" } });
      const classificationSystemPrompt =
        'Du analysierst eine Nutzer-Nachricht und entscheidest, welche Transition zutrifft. Antworte NUR mit der Zahl der zutreffenden Transition oder "0" wenn keine zutrifft. Keine Erklärung. Nur die Zahl.';
      const classificationHistory = Array.isArray(request.history)
        ? request.history
        : [];
      const classificationUserPrompt = buildClassificationPrompt(
        currentStateId,
        userMessage,
        currentState.transitions,
        effectiveWorkPlan(currentStateId, currentState.workPlan),
        classificationHistory,
      );

      try {
        const classificationResponse = await fetch(
          ensureChatCompletionsUrl(endpoint.apiUrl),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${endpoint.apiKey}`,
            },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 5,
              messages: [
                { role: "system", content: classificationSystemPrompt },
                { role: "user", content: classificationUserPrompt },
              ],
            }),
          },
        );

        if (classificationResponse.ok) {
          const classificationJson = (await classificationResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawChoice =
            classificationJson?.choices?.[0]?.message?.content?.trim() ?? "0";
          const choiceNum = parseInt(rawChoice, 10);
          if (
            !isNaN(choiceNum) &&
            choiceNum >= 1 &&
            choiceNum <= currentState.transitions.length
          ) {
            newStateId = currentState.transitions[choiceNum - 1].to;
          }
        }
      } catch {
        // Classification error: keep current state, continue with response
      }
    }

    if (!isStreamActive(streamId)) return;

    // Calls 2 / 2b / 2c — run in parallel, all depend only on Call 1's result (newStateId).
    const currentEffectiveWorkPlan = effectiveWorkPlan(currentStateId, currentState.workPlan);

    let stateSummary: string | undefined;
    let naviPlan: string | undefined = request.naviPlan ?? undefined;
    let naviCurrentProblem: string | undefined = request.naviCurrentProblem ?? undefined;
    let naviCurrentProblemInterpretation: string | undefined = request.naviCurrentProblemInterpretation ?? undefined;
    let naviProblemQueue: string[] = request.naviProblemQueue ?? [];
    let updatedNaviContext: import("../../src/types.js").NaviContext | undefined;

    // Sync pre-step: re-entering clarify_problem with a queued problem → pop it now so that
    // Call 2b (plan generation) correctly sees naviPlan = undefined and generates a fresh plan.
    if (newStateId === "clarify_problem" && currentStateId !== "clarify_problem") {
      if (naviProblemQueue.length > 0 && naviCurrentProblem) {
        naviCurrentProblem = naviProblemQueue[0];
        naviCurrentProblemInterpretation = undefined; // will be regenerated by extraction call below
        naviProblemQueue = naviProblemQueue.slice(1);
        naviPlan = undefined;
        emit({ type: "navi_problems", data: { current: naviCurrentProblem, queue: naviProblemQueue } });
      }
    }

    await Promise.all([
      // Call 2: summary of the completed state (on transition with workPlan).
      (async () => {
        if (newStateId === currentStateId || currentEffectiveWorkPlan.length === 0) return;
        emit({ type: "navi_step", data: { label: "Erstelle Zusammenfassung …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.join("\n");
          const summaryPrompt = buildStateSummaryPrompt(currentStateId, currentEffectiveWorkPlan, excerpt);
          const summaryResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              temperature: 0.1,
              messages: [{ role: "user", content: summaryPrompt }],
            }),
          });
          if (summaryResponse.ok) {
            const summaryJson = (await summaryResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
            stateSummary = normalizeText(summaryJson?.choices?.[0]?.message?.content ?? "") || undefined;
          }
        } catch (err) {
          console.error("[navi] State summary generation failed:", err);
        }
      })(),

      // Call 2b: question plan for clarify_problem (first entry or after problem queue pop).
      (async () => {
        if (newStateId !== "clarify_problem" || naviPlan) return;
        emit({ type: "navi_step", data: { label: "Plane Fragen …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-10).join("\n");
          const planHints = projConfig?.naviPlanHints?.[newStateId];
          const planSystemPromptParts = [
            "Du analysierst das Gespräch zwischen Navi (KI-Berater) und einem Händler.",
            "Deine Aufgabe: Erstelle eine kurze, priorisierte Liste der wichtigsten offenen Fragen, die Navi noch klären muss – ausschließlich zum Hauptproblem, das der Händler genannt hat.",
            "WICHTIG: Alle Fragen müssen sich auf DIESES EINE Hauptproblem beziehen. Keine Fragen zu anderen Themen oder potenziellen Nebenproblemen.",
            "Unterscheide dabei nach Händlertyp: Online-Handel (nur online), Vor-Ort-Handel (nur stationär), oder beides kombiniert.",
            "Fokussiere auf praktische Lücken – nicht auf Hintergründe, Ausmaß oder Auswirkungen.",
            "Fragen die bereits beantwortet wurden, NICHT aufnehmen.",
            "Maximal 5 Fragen. Antwortformat: NUR eine Bullet-Liste mit '-', kein anderer Text.",
          ];
          if (planHints?.include?.length) {
            planSystemPromptParts.push(`PFLICHT-THEMEN (müssen abgedeckt sein, sofern noch nicht beantwortet):\n${planHints.include.map((h) => `- ${h}`).join("\n")}`);
          }
          if (planHints?.exclude?.length) {
            planSystemPromptParts.push(`VERBOTENE THEMEN (auf keinen Fall fragen):\n${planHints.exclude.map((h) => `- ${h}`).join("\n")}`);
          }
          const planSystemPrompt = planSystemPromptParts.join("\n");
          const planUserPrompt = `Gesprächsausschnitt:\n${excerpt}\n\nWelche offenen Fragen muss Navi noch klären, um das genannte Hauptproblem des Händlers konkret zu verstehen und die praktische Lücke zu finden? Nur Fragen zu diesem einen Problem.`;
          const planResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 150,
              temperature: 0.1,
              messages: [{ role: "system", content: planSystemPrompt }, { role: "user", content: planUserPrompt }],
            }),
          });
          if (planResponse.ok) {
            const planJson = (await planResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
            const rawPlan = normalizeText(planJson?.choices?.[0]?.message?.content ?? "");
            if (rawPlan) {
              naviPlan = rawPlan;
              emit({ type: "navi_plan", data: { plan: naviPlan } });
            }
          }
        } catch (err) {
          console.error("[navi] Question plan generation failed:", err);
        }
      })(),

      // Call 2d: naviContext extraction — on every state transition to keep the structured fact sheet current.
      (async () => {
        if (newStateId === currentStateId) return;
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-20).join("\n");
          const contextPrompt = buildNaviContextPrompt(excerpt);
          const contextResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 200,
              temperature: 0,
              messages: [{ role: "user", content: contextPrompt }],
            }),
          });
          if (contextResponse.ok) {
            const contextJson = (await contextResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
            const raw = normalizeText(contextJson?.choices?.[0]?.message?.content ?? "");
            const jsonMatch = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const start = jsonMatch.indexOf("{");
            const end = jsonMatch.lastIndexOf("}");
            if (start !== -1 && end > start) {
              const parsed = JSON.parse(jsonMatch.slice(start, end + 1)) as Record<string, unknown>;
              const ctx: import("../../src/types.js").NaviContext = {};
              if (typeof parsed.laden === "string" && parsed.laden.trim()) ctx.laden = parsed.laden.trim();
              if (typeof parsed.problem === "string" && parsed.problem.trim()) ctx.problem = parsed.problem.trim();
              if (typeof parsed.luecke === "string" && parsed.luecke.trim()) ctx.luecke = parsed.luecke.trim();
              if (typeof parsed.stack === "string" && parsed.stack.trim()) ctx.stack = parsed.stack.trim();
              if (typeof parsed.empfehlung === "string" && parsed.empfehlung.trim()) ctx.empfehlung = parsed.empfehlung.trim();
              if (Object.keys(ctx).length > 0) {
                updatedNaviContext = ctx;
              }
            }
          }
        } catch (err) {
          console.error("[navi] NaviContext extraction failed:", err);
        }
      })(),

      // Call 2c: problem extraction — first entry into clarify_problem without a known current problem.
      (async () => {
        // Run when first entering clarify_problem OR after a queue-pop (interpretation cleared).
        if (newStateId !== "clarify_problem" || currentStateId === "clarify_problem" || naviCurrentProblemInterpretation) return;
        emit({ type: "navi_step", data: { label: "Erkenne Anliegen …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-10).join("\n");

          // If problem label is already known (queue-pop), only generate interpretation.
          const knownProblem = naviCurrentProblem;
          const extractSystemPrompt = knownProblem
            ? [
                "Du analysierst ein Gespräch zwischen Navi (KI-Berater) und einem Händler.",
                `Das aktuelle Problem des Händlers ist bereits bekannt: "${knownProblem}"`,
                "Deine Aufgabe: Erstelle eine kurze Interpretation dieses Problems.",
                "Die Interpretation erklärt: Was bedeutet das Problem wirklich? In welche Richtung zeigt die Lösung?",
                "Beispiel: 'Struktureller Rückgang der Laufkundschaft in der Gegend – nicht store-spezifisch. Lösung: alternative Kanäle erschließen (online, Reichweite), nicht Außenauftritt optimieren.'",
                "Antworte NUR mit gültigem JSON: { \"current\": \"...\", \"interpretation\": \"...\", \"queue\": [] }",
              ].join("\n")
            : [
                "Du analysierst ein Gespräch zwischen Navi (KI-Berater) und einem Händler.",
                "Deine Aufgabe: Finde alle konkreten Probleme oder Anliegen, die der Händler genannt hat.",
                "Gib das wichtigste / zuerst genannte Problem als 'current' zurück.",
                "Erstelle außerdem eine kurze 'interpretation': Was bedeutet das Problem wirklich? In welche Richtung zeigt die Lösung?",
                "Beispiel interpretation: 'Struktureller Rückgang der Laufkundschaft – nicht store-spezifisch. Lösung: alternative Kanäle erschließen, nicht Außenauftritt optimieren.'",
                "Alle weiteren Probleme als Array in 'queue' (leer wenn keins). Kurze Labels, z. B. 'Buchhaltung zu aufwändig'.",
                "Antworte NUR mit gültigem JSON: { \"current\": \"...\", \"interpretation\": \"...\", \"queue\": [] }",
              ].join("\n");

          const extractResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 200,
              temperature: 0.1,
              messages: [
                { role: "system", content: extractSystemPrompt },
                { role: "user", content: `Gesprächsausschnitt:\n${excerpt}\n\nAnalysiere das Problem des Händlers.` },
              ],
            }),
          });
          if (extractResponse.ok) {
            const extractJson = (await extractResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
            const raw = normalizeText(extractJson?.choices?.[0]?.message?.content ?? "");
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { current?: string; interpretation?: string; queue?: string[] };
              if (parsed.current) {
                naviCurrentProblem = parsed.current;
                naviCurrentProblemInterpretation = parsed.interpretation ?? "";
                naviProblemQueue = Array.isArray(parsed.queue) ? parsed.queue : naviProblemQueue;
                emit({ type: "navi_problems", data: { current: naviCurrentProblem, interpretation: naviCurrentProblemInterpretation, queue: naviProblemQueue } });
              }
            }
          }
        } catch (err) {
          console.error("[navi] Problem extraction failed:", err);
        }
      })(),
    ]);

    emit({
      type: "navi_state",
      data: {
        stateId: newStateId,
        ...(newStateId !== currentStateId
          ? { completedStateId: currentStateId }
          : {}),
        ...(stateSummary ? { summary: stateSummary } : {}),
      },
    });

    if (updatedNaviContext) {
      emit({ type: "navi_context", data: updatedNaviContext });
    }

    const newState = getNaviState(newStateId) ?? currentState;

    let effectiveInstruction = newState.instruction;
    const instructionOverride = projConfig?.naviInstructions?.[newStateId];
    if (typeof instructionOverride === "string" && instructionOverride.trim()) {
      effectiveInstruction = instructionOverride;
    }

    // Inject the question plan if we are in clarify_problem and have a plan.
    // The plan is specific to this conversation and takes priority — inject it FIRST so the LLM
    // picks the right next question before reading the general rules below.
    const activePlan = naviPlan ?? (request.naviPlan ?? undefined);
    if (newStateId === "clarify_problem" && activePlan) {
      effectiveInstruction = [
        `Nächste Fragen für dieses Gespräch (in dieser Reihenfolge – bereits beantwortete überspringen):`,
        activePlan,
        `---`,
        `Allgemeine Regeln (nur anwenden, wenn der Plan oben keine Abdeckung hat):`,
        effectiveInstruction,
      ].join("\n");
    }

    // Build a standalone problem-focus block injected as its own section in the system prompt.
    const problemFocusBlock = naviCurrentProblem
      ? [
          `Das Anliegen des Händlers: "${naviCurrentProblem}"`,
          ...(naviCurrentProblemInterpretation ? [`→ ${naviCurrentProblemInterpretation}`] : []),
          ...(naviProblemQueue.length > 0 ? [`Weitere Anliegen danach: ${naviProblemQueue.join(", ")}`] : []),
          "Alle Fragen ausschließlich zu diesem Anliegen – nichts anderes.",
        ].join("\n")
      : null;

    // In closing, remind Navi of any queued problems so it can proactively ask about them.
    if (newStateId === "closing" && naviProblemQueue.length > 0) {
      effectiveInstruction = `${effectiveInstruction}\n\nNoch nicht besprochene Anliegen des Händlers: ${naviProblemQueue.map((p) => `"${p}"`).join(", ")}. Frage am Ende freundlich, ob der Händler eines dieser Themen noch angehen möchte.`;
    }

    const knowledgePrompt = buildNaviKnowledgePrompt(newStateId);

    // Build structured fact sheet from naviContext (compact overview for all states).
    const naviCtx = request.naviContext;
    const naviContextSection = (() => {
      if (!naviCtx) return "";
      const parts: string[] = [];
      if (naviCtx.laden) parts.push(`- Laden: ${naviCtx.laden}`);
      if (naviCtx.problem) parts.push(`- Problem: ${naviCtx.problem}`);
      if (naviCtx.luecke) parts.push(`- Praktische Lücke: ${naviCtx.luecke}`);
      if (naviCtx.stack) parts.push(`- Stack: ${naviCtx.stack}`);
      if (naviCtx.empfehlung) parts.push(`- Empfehlung: ${naviCtx.empfehlung}`);
      if (parts.length === 0) return "";
      return "Bekannte Fakten über den Händler:\n" + parts.join("\n");
    })();

    // Build context block from accumulated state summaries (from previous states).
    const naviResults = request.naviResults ?? {};
    const resultEntries = Object.entries(naviResults).filter(([, v]) => v?.trim());
    const naviResultsContext =
      resultEntries.length > 0
        ? [
            "Bisher herausgefundene Fakten aus früheren Gesprächsphasen:",
            ...resultEntries.map(([stateId, summary]) => `[${stateId}]\n${summary}`),
          ].join("\n\n")
        : "";

    // Layer 1: narrow persona for info-gathering states, full for advisory states.
    const coveredTips = new Set(request.naviCoveredTips ?? []);
    const pendingTips = NAVI_TIPS.filter((t) => !coveredTips.has(t.id));
    const tipsPromptSection =
      pendingTips.length > 0
        ? [
            "Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich in das Gespräch passen – danach nicht wiederholen:",
            ...pendingTips.map((t) => `- ${t.instruction}`),
          ].join("\n")
        : "";

    const naviSystemPrompt = newState.persona === "narrow"
      ? [
          "Du bist in einem direkten Gespräch. Dein Gegenüber sitzt vor dir und schreibt mit dir.",
          "Sprich ihn immer direkt an – immer 'du', niemals 'der Händler' oder dritte Person.",
          "Antworte auf Deutsch. Kurz und natürlich.",
          "Du hast zwei Tools: ask_question für eine einzelne offene Frage, ask_clarification für Mehrfachauswahl. Die Aufgabe unten sagt dir wann welches Tool zu nutzen ist – halte dich exakt daran.",
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(naviContextSection ? [naviContextSection] : []),
          ...(naviResultsContext ? [naviResultsContext] : []),
          `Deine Aufgabe in diesem Schritt: ${effectiveInstruction}`,
        ].join("\n\n")
      : [
          "Du bist Navi, ein ehrlicher KI-Berater für Einzelhändler.",
          "Deine Nutzer sind Händler – meist ohne KI-Vorkenntnisse. Sprich auf Augenhöhe, kein Fachjargon.",
          "Antworte immer auf Deutsch, kurz und direkt.",
          "Keine Bullet-Listen außer wenn das ask_clarification Tool verwendet wird.",
          "Maximal eine Frage pro Antwort.",
          "Empfehle nur Lösungen, die zum bestehenden Software-Stack des Händlers passen. Schlage keinen Stack-Umbau vor.",
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(naviContextSection ? [naviContextSection] : []),
          ...(naviResultsContext ? [naviResultsContext] : []),
          `Deine aktuelle Aufgabe: ${effectiveInstruction}`,
          ...(tipsPromptSection ? [tipsPromptSection] : []),
          ...(knowledgePrompt ? [knowledgePrompt] : []),
        ].join("\n\n");

    const conversationMessages: OpenAiMessage[] = [
      { role: "system", content: naviSystemPrompt },
    ];
    const history = Array.isArray(request.history) ? request.history : [];
    for (const msg of history) {
      if (msg.hidden) continue;
      if (msg.role === "assistant") {
        const content =
          typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content) continue;
        const toolCalls = Array.isArray(msg.toolCalls)
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }))
          : undefined;
        conversationMessages.push({
          role: "assistant",
          content,
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      } else if (msg.role === "tool") {
        const content =
          typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content || !msg.toolCallId) continue;
        conversationMessages.push({
          role: "tool",
          content,
          tool_call_id: msg.toolCallId,
        });
      } else if (msg.role === "user") {
        const content =
          typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content) continue;
        conversationMessages.push({ role: "user", content });
      }
    }
    if (userMessage) {
      conversationMessages.push({ role: "user", content: userMessage });
    }

    // Layer 2: tool constraints per state — structurally limits what the LLM can output.
    const { tools: naviTools, toolChoice } = buildNaviStateTools(newState);

    let tokenCount = 0;
    let fullAssistantText = "";
    const maxNaviToolRounds = 3;
    let toolRound = 0;

    emit({ type: "navi_step", data: { label: null } }); // clear step indicator before main stream

    while (toolRound < maxNaviToolRounds) {
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
          ...(naviTools.length > 0 ? { tools: naviTools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        }),
      });

      if (!response.ok) {
        let detail = `Navi chat error: ${response.status}`;
        try {
          const body = await response.text();
          if (body) detail += ` — ${body}`;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let roundAssistantText = "";
      const collectedToolCalls = new Map<number, ToolCall>();

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
          if (!line.startsWith("data:")) continue;
          const data = line.substring(5).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            currentEvent = "";
            continue;
          }
          if (currentEvent === "error") throw new Error(data);

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
            tokenCount++;
            roundAssistantText += token;
            fullAssistantText += token;
            emit({ type: "token", data: token });
          }

          accumulateToolCallChunks(parsed, collectedToolCalls);

          const finishReason = extractFinishReason(parsed);
          if (finishReason === "tool_calls") break;
          currentEvent = "";
        }
      }

      const toolCalls = [...collectedToolCalls.values()];

      if (toolCalls.length === 0) {
        if (!isStreamActive(streamId)) return;
        if (tokenCount === 0 && !roundAssistantText.trim()) {
          emit({ type: "error", data: { message: "MODEL_EMPTY_RESPONSE" } });
          return;
        }
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      // Layer 2+3: ask_question is a structural output constraint.
      // Extract the response and stream it as plain text — no real tool execution.
      const askQuestionCall = toolCalls.find((tc) => tc.function.name === "ask_question");
      if (askQuestionCall) {
        let response = "";
        try {
          const args = JSON.parse(askQuestionCall.function.arguments) as { response?: unknown };
          response = typeof args.response === "string" ? args.response.trim() : "";
        } catch {
          response = askQuestionCall.function.arguments.trim();
        }
        // Layer 3: ensure question mark is present when required.
        if (newState.validation?.requiresQuestion && response && !response.includes("?")) {
          response += "?";
        }
        if (response) {
          fullAssistantText = response;
          emit({ type: "token", data: response });
        }
        if (!isStreamActive(streamId)) return;
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      for (const toolCall of toolCalls) {
        emit({ type: "tool_call", data: describeStreamingToolCall(toolCall) });
      }

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        executedResults.push(await executeToolCall(projectPath, toolCall));
      }

      const toolHistoryMessages: ChatMessage[] = [
        { role: "assistant", content: roundAssistantText, toolCalls, hidden: true },
        ...executedResults.map((result) => ({
          role: "tool" as const,
          toolCallId: result.toolCallId,
          content: result.result,
          hidden: false,
        })),
      ];
      emit({ type: "tool_history", data: toolHistoryMessages });

      conversationMessages.push({
        role: "assistant",
        content: roundAssistantText,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
      for (const result of executedResults) {
        conversationMessages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.result,
        });
      }

      // ask_clarification requires user interaction — stop here
      if (toolCalls.some((tc) => tc.function.name === "ask_clarification")) {
        if (!isStreamActive(streamId)) return;
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      toolRound += 1;
    }

    if (!isStreamActive(streamId)) return;

    // Call N: Check which tips were covered in this response.
    const coveredTipsSet = new Set(request.naviCoveredTips ?? []);
    const stillPendingTips = NAVI_TIPS.filter((t) => !coveredTipsSet.has(t.id));
    if (stillPendingTips.length > 0 && fullAssistantText.trim()) {
      try {
        const tipsCheckPrompt = [
          "Du prüfst, ob eine Antwort bestimmte Themen angesprochen hat.",
          "",
          `Antwort:\n"${fullAssistantText.slice(0, 800)}"`,
          "",
          "Welche der folgenden Themen wurden in der Antwort angesprochen?",
          ...stillPendingTips.map((t) => `- ${t.id}: ${t.coveredWhen}`),
          "",
          'Antworte NUR mit einer kommaseparierten Liste der IDs der angesprochenen Themen, oder "keine". Keine Erklärung.',
        ].join("\n");

        const tipsCheckResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${endpoint.apiKey}`,
          },
          body: JSON.stringify({
            model: endpoint.model,
            stream: false,
            max_tokens: 50,
            temperature: 0,
            messages: [{ role: "user", content: tipsCheckPrompt }],
          }),
        });

        if (tipsCheckResponse.ok) {
          const tipsCheckJson = (await tipsCheckResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const raw = normalizeText(tipsCheckJson?.choices?.[0]?.message?.content ?? "");
          if (raw && raw !== "keine") {
            const coveredIds = raw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((id) => stillPendingTips.some((t) => t.id === id));
            if (coveredIds.length > 0) {
              emit({ type: "navi_tips_covered", data: { coveredIds } });
            }
          }
        }
      } catch {
        // Tips classifier failed — non-fatal
      }
    }

    emit({ type: "done", data: { fullAssistantText } });
  } catch (error) {
    if (!isStreamActive(streamId)) return;
    emit({
      type: "error",
      data: {
        message:
          error instanceof Error ? error.message : "NAVI_STREAM_FAILED",
      },
    });
  }
}

async function runChatStream(
  streamId: string,
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (request.sessionKind === "navi") {
    return runNaviChatStream(streamId, projectPath, request, emit);
  }

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
      preview.contextBlocks,
    );
    let toolRound = 0;
    let tokenCount = 0;
    let fullAssistantText = "";
    const maxToolRounds = preview.maxToolRounds;

    while (toolRound < maxToolRounds) {
      if (!isStreamActive(streamId)) return;

      console.debug(
        `[chat] toolRound=${toolRound} starting, messages=${conversationMessages.length}, ` +
          `last role="${conversationMessages.at(-1)?.role}"`,
      );

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
      const collectedToolCalls = new Map<number, ToolCall>();

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

          accumulateToolCallChunks(parsed, collectedToolCalls);

          const finishReason = extractFinishReason(parsed);
          if (finishReason) {
            console.debug(
              `[chat] toolRound=${toolRound} finish_reason="${finishReason}"`,
            );
          }
          if (finishReason === "tool_calls") {
            break;
          }

          currentEvent = "";
        }
      }

      const toolCalls = [...collectedToolCalls.values()];

      console.debug(
        `[chat] toolRound=${toolRound} stream ended: toolCalls=${toolCalls.length}, ` +
          `tokenCount=${tokenCount}, roundText.length=${roundAssistantText.length}`,
      );
      for (const tc of toolCalls) {
        console.debug(
          `[chat]   toolCall id="${tc.id}" name="${tc.function.name}" ` +
            `arguments=${tc.function.arguments}`,
        );
      }

      if (toolCalls.length === 0) {
        if (!isStreamActive(streamId)) return;

        if (tokenCount === 0 && !roundAssistantText.trim()) {
          console.warn(
            `[chat] MODEL_EMPTY_RESPONSE: toolRound=${toolRound}, tokenCount=${tokenCount}, ` +
              `collectedToolCalls.size=${collectedToolCalls.size}`,
          );
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

      const embeddingCreds = resolveEmbeddingCredentials(
        provider,
        request.useReasoning,
      );
      const embeddingConfig: EmbeddingConfig | undefined = embeddingCreds
        ? { apiUrl: embeddingCreds.apiUrl, apiKey: embeddingCreds.apiKey }
        : undefined;

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        executedResults.push(
          await executeToolCall(projectPath, toolCall, embeddingConfig),
        );
      }

      for (const r of executedResults) {
        console.debug(
          `[chat] tool "${r.name}" result length=${r.result.length} ` +
            `(preview: ${r.result.slice(0, 120).replace(/\n/g, "\\n")})`,
        );
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

      // Some tools require user interaction before the assistant can continue.
      // Stop the loop immediately so the UI can present the clarification or
      // guided-thread offer to the user instead of firing another LLM round.
      const hasUserInteractionTool = toolCalls.some(
        (tc) =>
          tc.function.name === "ask_clarification" ||
          tc.function.name === "propose_guided_thread",
      );

      if (hasUserInteractionTool) {
        if (!isStreamActive(streamId)) return;
        emit({
          type: "done",
          data: { fullAssistantText },
        });
        return;
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

/**
 * Generates a concise summary of a thread's messages using a (potentially different) LLM.
 * Uses a non-streaming completion request.
 */
export interface ThreadSummaryResult {
  summary: string;
  title: string;
}

export async function generateThreadSummary(
  threadMessages: ChatMessage[],
  llmId: string | null | undefined,
  focusInstructions?: string | null,
  parentMessages?: ChatMessage[],
): Promise<ThreadSummaryResult> {
  const focus =
    typeof focusInstructions === "string" && focusInstructions.trim().length > 0
      ? focusInstructions.trim()
      : "";
  console.trace(
    `[chat] generateThreadSummary: llmId=${llmId ?? "(default)"}, threadMessages=${threadMessages.length}, ` +
      `parentMessages=${parentMessages?.length ?? 0}, ` +
      `focusInstructions=${focus ? `"${focus.slice(0, 80)}${focus.length > 80 ? "…" : ""}"` : "(none)"}`,
  );

  const provider = await resolveAiProvider(llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const toTranscript = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => !m.hidden && m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

  const visibleParent = parentMessages ? toTranscript(parentMessages) : "";
  const threadTranscript = toTranscript(threadMessages);

  const contextSection = visibleParent.trim()
    ? `=== Parent-Chat ===\n\n${visibleParent}\n\n=== Thread ===\n\n${threadTranscript}`
    : `=== Thread ===\n\n${threadTranscript}`;

  const systemBase =
    "Du bist ein präziser Assistent. Du erhältst den vollständigen Kontext: den Parent-Chat und einen daraus verzweigten Thread. " +
    "Deine Aufgabe ist es, das Ergebnis des Threads knapp und sachlich aufzuschreiben — so, dass es als Beitrag im Parent-Chat sinnvoll ist. " +
    "Fasse nicht den gesamten Thread nach; schreibe nur, was der Thread erbracht hat (Erkenntnisse, Entscheidungen, Ergebnisse). ";
  const systemFocus = focus
    ? "Der Nutzer gibt unten explizit an, welche Aspekte für den Parent-Chat relevant sind — " +
      "berücksichtige nur diese; lasse alles andere weg, sofern es nicht nötig ist, diese Punkte zu verstehen. "
    : "";
  const systemTail =
    'Antworte ausschließlich mit einem JSON-Objekt in exakt diesem Format (kein Markdown, kein Code-Block, kein Kommentar davor oder danach):\n' +
    '{"title":"<prägnanter Titel für den Thread, max. 6 Wörter>","summary":"<Ergebnis-Text für den Parent-Chat>"}';

  const userLead = focus
    ? `Relevante Aspekte laut Nutzer:\n\n${focus}\n\n---\n\n`
    : "";

  const requestMessages = [
    {
      role: "system" as const,
      content: systemBase + systemFocus + systemTail,
    },
    {
      role: "user" as const,
      content: `${userLead}${contextSection}`,
    },
  ];

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      messages: requestMessages,
    }),
  });

  if (!response.ok) {
    let detail = `Thread summary error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json?.choices?.[0]?.message?.content?.trim() ?? "";

  // Strip optional markdown code fence the LLM might add despite instructions
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: { title?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { title?: unknown; summary?: unknown };
  } catch {
    // Graceful fallback: treat the whole response as summary, leave title empty
    console.warn("[chat] generateThreadSummary: failed to parse JSON, falling back", jsonText.slice(0, 200));
    parsed = { summary: raw, title: "" };
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const title   = typeof parsed.title   === "string" ? parsed.title.trim()   : "";

  console.trace(
    `[chat] generateThreadSummary finished, summary length=${summary.length}, title="${title}"`,
  );
  return { summary, title };
}

/** One transcript line of a simulation: who said it and what. */
export interface SimulationTranscriptLine {
  /** `"navi"` = the Navi advisor, `"merchant"` = the simulated user. */
  speaker: "navi" | "merchant";
  content: string;
}

export interface SimulatedUserReplyRequest {
  /** The persona/goal of the simulated merchant (from SimulationConfig.goal). */
  goal: string;
  /** Optional persona names to give the merchant a concrete identity. */
  characterNames?: string[];
  /** Visible conversation so far, in order. */
  transcript: SimulationTranscriptLine[];
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
}

/**
 * Generates the next reply of a *simulated merchant* reacting to Navi.
 *
 * The merchant plays the user side of a Navi advisory chat so the Navi flow can
 * be exercised end-to-end without a human typing. Roles are flipped for the LLM:
 * Navi's lines become `user` (it is talking *to* the merchant) and the merchant's
 * own past lines become `assistant`.
 */
export async function generateSimulatedUserReply(
  req: SimulatedUserReplyRequest,
): Promise<{ reply: string }> {
  const provider = await resolveAiProvider(req.llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const persona = normalizeText(req.goal) || "Ein typischer kleiner Händler.";
  const names = (req.characterNames ?? [])
    .map((n) => normalizeText(n))
    .filter(Boolean);
  const nameHint =
    names.length > 0 ? `Dein Name / deine Rolle: ${names.join(", ")}.` : "";

  const systemPrompt = [
    "Du spielst einen Händler/Ladenbesitzer in einem simulierten Beratungsgespräch.",
    "Dein Gegenüber ist 'Navi', ein KI-Berater, der dir Fragen stellt.",
    "Antworte AUSSCHLIESSLICH aus der Perspektive des Händlers – kurz, natürlich, umgangssprachlich, 1–3 Sätze.",
    "Erfinde plausible, konsistente Details (Laden, Probleme, genutzte Tools, Budget), die zum Profil passen.",
    "Du bist der Kunde: stelle selbst keine Beratungsfragen, gib keine Meta-Kommentare, keine Anführungszeichen, kein Rollen-Präfix.",
    nameHint,
    `Profil/Ziel dieser Simulation: ${persona}`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: OpenAiMessage[] = [{ role: "system", content: systemPrompt }];
  for (const line of req.transcript) {
    const content = normalizeText(line.content);
    if (!content) continue;
    messages.push({
      role: line.speaker === "navi" ? "user" : "assistant",
      content,
    });
  }
  // Nothing from Navi yet (shouldn't normally happen): nudge the merchant to open.
  if (messages.length === 1) {
    messages.push({ role: "user", content: "(Das Gespräch beginnt.)" });
  }

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      max_tokens: 200,
      temperature: 0.9,
      messages,
    }),
  });

  if (!response.ok) {
    let detail = `Simulated user reply error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = normalizeText(json?.choices?.[0]?.message?.content ?? "");
  return { reply };
}

export interface EvaluateNaviSimulationRequest {
  /** Persona description / goal the merchant was playing. */
  persona: string;
  /** Optional persona name for context. */
  personaName?: string;
  /** Full Navi ↔ merchant transcript, in order. */
  transcript: SimulationTranscriptLine[];
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
}

export interface EvaluateNaviSimulationResult {
  /** Overall score from 0–100 (best effort; -1 if not parseable). */
  score: number;
  /** Markdown analysis of how well Navi performed. */
  report: string;
}

/**
 * Evaluates how well the Navi advisor handled a finished simulation run.
 *
 * A separate "reviewer" LLM reads the full transcript (Navi vs. simulated
 * merchant) and judges Navi's performance: did it understand the problem, ask
 * good questions, give a fitting recommendation, stay on track? Returns a score
 * plus a structured markdown report.
 */
export async function evaluateNaviSimulation(
  req: EvaluateNaviSimulationRequest,
): Promise<EvaluateNaviSimulationResult> {
  const provider = await resolveAiProvider(req.llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const persona = normalizeText(req.persona) || "Ein typischer kleiner Händler.";
  const personaName = normalizeText(req.personaName ?? "");

  const transcriptText = req.transcript
    .map((line) => {
      const content = normalizeText(line.content);
      if (!content) return "";
      const speaker = line.speaker === "navi" ? "Navi" : "Händler";
      return `${speaker}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");

  const systemPrompt = [
    "Du bist ein strenger, fairer Qualitätsprüfer für 'Navi', einen KI-Berater, der kleinen Händlern hilft herauszufinden, ob und welche KI-/Software-Tools ihnen nützen.",
    "Du bekommst das Profil eines simulierten Händlers und das vollständige Gesprächsprotokoll zwischen Navi und diesem Händler.",
    "Bewerte AUSSCHLIESSLICH die Leistung von Navi (nicht die des Händlers).",
    "Achte auf: Hat Navi das Problem des Händlers richtig verstanden? Wurden gute, gezielte Rückfragen gestellt? War die Empfehlung passend, konkret und auf das Profil zugeschnitten? Blieb Navi im roten Faden, ohne sich zu wiederholen oder abzuschweifen? War der Ton angemessen?",
    "Sei ehrlich und konkret – belege Stärken und Schwächen mit Bezug auf das Gespräch.",
    "Antworte als gültiges JSON-Objekt mit genau diesen Feldern:",
    '{ "score": <Zahl 0-100>, "summary": "<1-2 Sätze Gesamturteil>", "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] }',
    "Antworte NUR mit dem JSON, ohne Markdown-Codeblock, ohne weiteren Text.",
  ].join("\n");

  const userPrompt = [
    personaName ? `Persona-Name: ${personaName}` : "",
    `Persona/Profil des Händlers:\n${persona}`,
    "",
    "Gesprächsprotokoll:",
    transcriptText || "(Kein Gesprächsverlauf vorhanden.)",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      max_tokens: 800,
      temperature: 0.3,
      messages,
    }),
  });

  if (!response.ok) {
    let detail = `Navi evaluation error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = normalizeText(json?.choices?.[0]?.message?.content ?? "");

  // Tolerant JSON extraction (model may wrap in a code fence despite instructions).
  let parsed: {
    score?: unknown;
    summary?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    suggestions?: unknown;
  } | null = null;
  try {
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      parsed = JSON.parse(jsonText.slice(start, end + 1));
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // Fall back to the raw text as the report if JSON parsing failed.
    return { score: -1, report: raw || "_Keine Bewertung verfügbar._" };
  }

  const scoreNum = Number(parsed.score);
  const score =
    Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= 100
      ? Math.round(scoreNum)
      : -1;
  const summary = normalizeText(String(parsed.summary ?? ""));
  const toList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((v) => normalizeText(String(v))).filter(Boolean)
      : [];
  const strengths = toList(parsed.strengths);
  const weaknesses = toList(parsed.weaknesses);
  const suggestions = toList(parsed.suggestions);

  const reportLines: string[] = [];
  reportLines.push(
    `**Gesamtbewertung:** ${score >= 0 ? `${score}/100` : "—"}`,
  );
  if (summary) {
    reportLines.push("", summary);
  }
  if (strengths.length > 0) {
    reportLines.push("", "**Stärken**", ...strengths.map((s) => `- ${s}`));
  }
  if (weaknesses.length > 0) {
    reportLines.push("", "**Schwächen**", ...weaknesses.map((s) => `- ${s}`));
  }
  if (suggestions.length > 0) {
    reportLines.push(
      "",
      "**Verbesserungsvorschläge**",
      ...suggestions.map((s) => `- ${s}`),
    );
  }

  return { score, report: reportLines.join("\n") };
}
