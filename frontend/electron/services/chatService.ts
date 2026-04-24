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
} from "./conversation/systemPrompt.js";
import {
  semanticSearch,
  type EmbeddingConfig,
} from "./vectorService.js";

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
  | { type: "error"; data: { message: string } };

export interface ChatStreamStartResult {
  streamId: string;
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


async function getWikiRoot(projectPath: string | null): Promise<string> {
  const root = ensureProjectPath(projectPath);
  const subDir = path.join(root, "wiki");
  try {
    const stat = await fs.stat(subDir);
    if (stat.isDirectory()) return subDir;
  } catch {
    // no wiki subdirectory — use project root directly
  }
  return root;
}


async function readWikiFile(
  projectPath: string | null,
  relativePath: string,
): Promise<string> {
  const wikiRoot = await getWikiRoot(projectPath);
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
  if (name === "semantic_search") return "Semantische Suche";
  if (name === "wiki_read") return "Lese Wiki-Datei";
  if (name === "glossary_add") return "Ergänze Glossar";
  if (name === "write_file") return "Schreibe Datei";
  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "propose_guided_thread") return "Biete Guided Thread an";
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
      result = JSON.stringify({ error: "No AI provider configured for embeddings." });
    } else {
      const searchResult = await semanticSearch(root, query, embeddingConfig, { limit, scope });
      const payload: Record<string, unknown> = { hits: searchResult.hits };
      if (searchResult.usedFallback) {
        payload.note = `Semantic index not available (${searchResult.fallbackReason ?? "unknown"}). Keyword search used as fallback.`;
      }
      result = JSON.stringify(payload);
    }
  } else if (name === "wiki_read") {
    const filePath = normalizeText(String(args.path ?? ""));
    result = await readWikiFile(projectPath, filePath);
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

      const embeddingConfig: EmbeddingConfig = {
        apiUrl: provider.fastApiUrl,
        apiKey: provider.fastApiKey,
      };

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        executedResults.push(await executeToolCall(projectPath, toolCall, embeddingConfig));
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
