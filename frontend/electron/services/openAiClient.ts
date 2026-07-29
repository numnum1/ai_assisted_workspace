import os from "node:os";
import path from "node:path";
import { normalizeText, readJsonFile } from "./conversation/projectContext.js";
import type { AiProvider } from "./aiProviderService.js";
import type { ToolCall } from "../../src/shared/types.js";

export interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAiStreamChunkChoiceDelta {
  content?: string;
}

export interface OpenAiStreamChunkChoice {
  delta?: OpenAiStreamChunkChoiceDelta;
  finish_reason?: string | null;
}

export interface OpenAiStreamChunk {
  choices?: OpenAiStreamChunkChoice[];
  model?: string;
}

const AI_PROVIDERS_FILE = "ai-providers.json";
const DEFAULT_PROVIDER_ID = "default";

function getAppDataDir(): string {
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  return path.join(os.homedir(), ".writing-assistant");
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
  const filePath = path.join(getAppDataDir(), AI_PROVIDERS_FILE);
  const raw = await readJsonFile<unknown[]>(filePath);
  if (!Array.isArray(raw)) return [];
  const out: AiProvider[] = [];
  for (const entry of raw) {
    const normalized = normalizeLoadedProvider(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function resolveAiProvider(llmId: string | null | undefined): Promise<AiProvider> {
  const providers = await loadAiProviders();
  const trimmedId = normalizeText(llmId);

  if (trimmedId) {
    const found = providers.find((p) => p.id === trimmedId);
    if (found) {
      console.info(
        `[ai] provider resolved: requestedLlmId="${trimmedId}" -> id="${found.id}" name="${found.name}" ` +
          `(fast="${found.fastModel}", reasoning="${found.reasoningModel}")`,
      );
      return found;
    }
    throw new Error(`AI provider not found: ${trimmedId}`);
  }

  const first = providers[0];
  if (first) {
    console.warn(
      `[ai] provider AUTO-SELECTED (no llmId sent by the UI): id="${first.id}" name="${first.name}" ` +
        `(fast="${first.fastModel}", reasoning="${first.reasoningModel}") — ` +
        `first of ${providers.length} in ai-providers.json [${providers.map((p) => p.id).join(", ")}]`,
    );
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

export function resolveProviderEndpoint(
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

  if (wantsReasoning && !hasReasoning) {
    console.warn(
      `[ai] reasoning requested but provider "${provider.name}" has no complete reasoning config — ` +
        `falling back to fast model "${normalizeText(provider.fastModel)}"`,
    );
  }

  const apiUrl = normalizeText(provider.fastApiUrl);
  const apiKey = normalizeText(provider.fastApiKey);
  const model = normalizeText(provider.fastModel);

  if (!apiUrl || !apiKey || !model) {
    throw new Error(
      `AI provider "${provider.name}" is incomplete. Fast URL, key and model are required.`,
    );
  }

  return { apiUrl, apiKey, model, maxTokens: provider.maxTokens };
}

export function ensureChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

/**
 * xAI's Grok API only accepts "low" or "high" for reasoning_effort — "medium"
 * (the UI's default) is rejected, and api.eecc.ai answers a rejected request by
 * silently routing to its "Auto" fallback model instead of erroring. Map "medium"
 * up to "high" for Grok models: that is the value the navi4 branch hardcodes in
 * naviChat.ts:357, i.e. the one empirically proven to work against this endpoint.
 */
export function normalizeReasoningEffort(
  model: string,
  effort: string,
): string {
  if (effort !== "medium") return effort;
  if (!/grok/i.test(model)) return effort;
  return "high";
}

function maskApiKey(apiKey: string): string {
  const key = normalizeText(apiKey);
  if (!key) return "(none)";
  return `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`;
}

/**
 * Logs the outgoing OpenAI-compatible request: which provider was picked for the
 * requested `llmId`, the exact URL/model, and a per-message summary. Set
 * `AI_LOG_BODY=1` to additionally dump the full JSON body (system prompt and all
 * context blocks included — can be very large). API keys are never logged in full.
 */
export function logAiRequest(
  label: string,
  info: {
    requestedLlmId?: string | null;
    provider: AiProvider;
    endpoint: { apiUrl: string; apiKey: string; model: string; maxTokens?: number };
    url: string;
    body: Record<string, unknown>;
  },
): void {
  const { requestedLlmId, provider, endpoint, url, body } = info;
  const requested = normalizeText(requestedLlmId);
  const messages = Array.isArray(body.messages) ? (body.messages as OpenAiMessage[]) : [];
  const tools = Array.isArray(body.tools) ? (body.tools as Array<Record<string, unknown>>) : [];

  console.info(
    `[ai] ${label} -> POST ${url}\n` +
      `[ai]   requestedLlmId=${requested ? `"${requested}"` : "(none → auto-selected)"} ` +
      `provider="${provider.name}" (id="${provider.id}")\n` +
      `[ai]   model="${endpoint.model}" stream=${body.stream === true} ` +
      `reasoning_effort=${body.reasoning_effort ?? "(none)"} ` +
      `max_tokens=${body.max_tokens ?? "(none)"} ` +
      `tools=${tools.length} apiKey=${maskApiKey(endpoint.apiKey)}\n` +
      `[ai]   messages=${messages.length} totalChars=${messages.reduce(
        (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
        0,
      )}`,
  );

  messages.forEach((message, index) => {
    const content = typeof message.content === "string" ? message.content : "";
    const preview = content.slice(0, 200).replace(/\s+/g, " ");
    console.debug(
      `[ai]   [${index}] role=${message.role} chars=${content.length}` +
        (message.tool_call_id ? ` tool_call_id=${message.tool_call_id}` : "") +
        (message.tool_calls ? ` tool_calls=${message.tool_calls.length}` : "") +
        `: ${preview}${content.length > 200 ? "…" : ""}`,
    );
  });

  if (tools.length > 0) {
    console.debug(
      `[ai]   toolNames=[${tools
        .map((tool) => {
          const fn = tool.function as { name?: string } | undefined;
          return fn?.name ?? "?";
        })
        .join(", ")}]`,
    );
  }

  if (process.env.AI_LOG_BODY === "1") {
    console.debug(`[ai]   fullBody=${JSON.stringify(body)}`);
  }
}

/** Logs the model the API actually answered with, so a mismatch becomes visible. */
export function logAiResponseModel(label: string, requestedModel: string, responseModel: unknown): void {
  const answered = typeof responseModel === "string" ? responseModel : "";
  if (!answered) return;
  if (answered === requestedModel) {
    console.info(`[ai] ${label} <- responded with model="${answered}"`);
    return;
  }
  console.warn(
    `[ai] ${label} <- MODEL MISMATCH: requested="${requestedModel}" but API answered with "${answered}"`,
  );
}

export function extractContentToken(chunk: OpenAiStreamChunk): string {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  const delta = choice?.delta;
  return typeof delta?.content === "string" ? delta.content : "";
}

export function extractFinishReason(chunk: OpenAiStreamChunk): string | null {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  return typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
}

export function makeToolCallId(index: number): string {
  return `tool-call-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

export function accumulateToolCallChunks(
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
      typeof functionPayload.arguments === "string" ? functionPayload.arguments : "";

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
