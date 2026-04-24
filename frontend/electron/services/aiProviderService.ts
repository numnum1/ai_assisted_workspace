import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface AiProvider {
  id: string;
  name: string;
  fastApiUrl: string;
  fastApiKey: string;
  fastModel: string;
  reasoningApiUrl: string;
  reasoningApiKey: string;
  reasoningModel: string;
  maxTokens?: number;
}

export interface AiProviderPublic {
  id: string;
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKeySet: boolean;
  reasoningApiUrl: string;
  reasoningModel: string;
  reasoningApiKeySet: boolean;
  maxTokens?: number;
}

export interface AiProviderRequest {
  name?: string;
  fastApiUrl?: string;
  fastApiKey?: string;
  fastModel?: string;
  reasoningApiUrl?: string;
  reasoningApiKey?: string;
  reasoningModel?: string;
  maxTokens?: number;
}

export interface AiProvidersListResponse {
  providers: AiProviderPublic[];
  webSearchAvailable?: boolean;
}

const APP_DIR_NAME = ".writing-assistant";
const PROVIDERS_FILE_NAME = "ai-providers.json";

function getAppDataDir(): string {
  return path.join(os.homedir(), APP_DIR_NAME);
}

function getProvidersFilePath(): string {
  return path.join(getAppDataDir(), PROVIDERS_FILE_NAME);
}

async function ensureAppDataDir(): Promise<void> {
  await fs.mkdir(getAppDataDir(), { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalUrl(value: string | null | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL: ${normalized}`);
  }
}

function normalizeOptionalMaxTokens(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("maxTokens must be a positive number when provided.");
  }
  return Math.round(value);
}

function sanitizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProviderId(name: string, existingIds: Set<string>): string {
  const base = sanitizeIdPart(name) || "provider";
  if (!existingIds.has(base)) return base;

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function toPublicProvider(provider: AiProvider): AiProviderPublic {
  return {
    id: provider.id,
    name: provider.name,
    fastApiUrl: provider.fastApiUrl,
    fastModel: provider.fastModel,
    fastApiKeySet: normalizeString(provider.fastApiKey).length > 0,
    reasoningApiUrl: provider.reasoningApiUrl,
    reasoningModel: provider.reasoningModel,
    reasoningApiKeySet: normalizeString(provider.reasoningApiKey).length > 0,
    maxTokens: provider.maxTokens,
  };
}

function sortProviders(providers: AiProvider[]): AiProvider[] {
  return [...providers].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function validateNormalizedProvider(provider: Omit<AiProvider, "id">): void {
  if (!provider.name) {
    throw new Error("Provider name must not be empty.");
  }

  const hasFast =
    provider.fastApiUrl.length > 0 || provider.fastModel.length > 0 || provider.fastApiKey.length > 0;
  const hasReasoning =
    provider.reasoningApiUrl.length > 0 ||
    provider.reasoningModel.length > 0 ||
    provider.reasoningApiKey.length > 0;

  if (!hasFast && !hasReasoning) {
    throw new Error("At least one Fast or Reasoning model configuration is required.");
  }

  if (hasFast) {
    if (!provider.fastApiUrl) throw new Error("Fast API URL is required when Fast config is used.");
    if (!provider.fastModel) throw new Error("Fast model is required when Fast config is used.");
    if (!provider.fastApiKey) throw new Error("Fast API key is required when Fast config is used.");
  }

  if (hasReasoning) {
    const effectiveReasoningUrl = provider.reasoningApiUrl || provider.fastApiUrl;
    if (!effectiveReasoningUrl) {
      throw new Error("Reasoning API URL or Fast API URL is required when Reasoning config is used.");
    }
    if (!provider.reasoningModel) {
      throw new Error("Reasoning model is required when Reasoning config is used.");
    }
    if (!provider.reasoningApiKey && !provider.fastApiKey) {
      throw new Error("Reasoning API key or Fast API key is required when Reasoning config is used.");
    }
  }
}

function normalizeProviderInput(
  body: AiProviderRequest,
  existing?: AiProvider,
): Omit<AiProvider, "id"> {
  const name = normalizeString(body.name ?? existing?.name);

  const fastApiUrl = normalizeOptionalUrl(body.fastApiUrl ?? existing?.fastApiUrl);
  const fastApiKey =
    body.fastApiKey !== undefined ? normalizeString(body.fastApiKey) : normalizeString(existing?.fastApiKey);
  const fastModel = normalizeString(body.fastModel ?? existing?.fastModel);

  const reasoningApiUrl = normalizeOptionalUrl(body.reasoningApiUrl ?? existing?.reasoningApiUrl);
  const reasoningApiKey =
    body.reasoningApiKey !== undefined
      ? normalizeString(body.reasoningApiKey)
      : normalizeString(existing?.reasoningApiKey);
  const reasoningModel = normalizeString(body.reasoningModel ?? existing?.reasoningModel);

  const maxTokens = normalizeOptionalMaxTokens(body.maxTokens ?? existing?.maxTokens);

  const normalized: Omit<AiProvider, "id"> = {
    name,
    fastApiUrl,
    fastApiKey,
    fastModel,
    reasoningApiUrl,
    reasoningApiKey,
    reasoningModel,
    maxTokens,
  };

  validateNormalizedProvider(normalized);
  return normalized;
}

async function readProviders(): Promise<AiProvider[]> {
  const filePath = getProvidersFilePath();
  if (!(await pathExists(filePath))) {
    return [];
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const providers: AiProvider[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<AiProvider>;
      const id = normalizeString(candidate.id);
      const name = normalizeString(candidate.name);
      if (!id || !name) continue;

      providers.push({
        id,
        name,
        fastApiUrl: normalizeString(candidate.fastApiUrl),
        fastApiKey: normalizeString(candidate.fastApiKey),
        fastModel: normalizeString(candidate.fastModel),
        reasoningApiUrl: normalizeString(candidate.reasoningApiUrl),
        reasoningApiKey: normalizeString(candidate.reasoningApiKey),
        reasoningModel: normalizeString(candidate.reasoningModel),
        maxTokens:
          typeof candidate.maxTokens === "number" && Number.isFinite(candidate.maxTokens)
            ? Math.round(candidate.maxTokens)
            : undefined,
      });
    }

    return sortProviders(providers);
  } catch {
    return [];
  }
}

async function writeProviders(providers: AiProvider[]): Promise<void> {
  await ensureAppDataDir();
  const filePath = getProvidersFilePath();
  await fs.writeFile(filePath, `${JSON.stringify(sortProviders(providers), null, 2)}\n`, "utf8");
}

export async function listProviders(): Promise<AiProvider[]> {
  return readProviders();
}

export async function listPublicProviders(): Promise<AiProvidersListResponse> {
  const providers = await readProviders();
  return {
    providers: providers.map(toPublicProvider),
    webSearchAvailable: false,
  };
}

export async function getProviderById(id: string): Promise<AiProvider | null> {
  const normalizedId = normalizeString(id);
  if (!normalizedId) return null;

  const providers = await readProviders();
  return providers.find((provider) => provider.id === normalizedId) ?? null;
}

export async function requireProviderById(id: string): Promise<AiProvider> {
  const provider = await getProviderById(id);
  if (!provider) {
    throw new Error(`AI provider not found: ${id}`);
  }
  return provider;
}

export async function createProvider(body: AiProviderRequest): Promise<AiProviderPublic> {
  const providers = await readProviders();
  const normalized = normalizeProviderInput(body);

  const existingIds = new Set(providers.map((provider) => provider.id));
  const nextProvider: AiProvider = {
    id: buildProviderId(normalized.name, existingIds),
    ...normalized,
  };

  providers.push(nextProvider);
  await writeProviders(providers);
  return toPublicProvider(nextProvider);
}

export async function updateProvider(id: string, body: AiProviderRequest): Promise<AiProviderPublic> {
  const normalizedId = normalizeString(id);
  if (!normalizedId) {
    throw new Error("Provider id must not be empty.");
  }

  const providers = await readProviders();
  const index = providers.findIndex((provider) => provider.id === normalizedId);
  if (index < 0) {
    throw new Error(`AI provider not found: ${id}`);
  }

  const current = providers[index];
  const normalized = normalizeProviderInput(body, current);
  const updated: AiProvider = {
    id: current.id,
    ...normalized,
  };

  providers[index] = updated;
  await writeProviders(providers);
  return toPublicProvider(updated);
}

export async function deleteProvider(id: string): Promise<{ status: string }> {
  const normalizedId = normalizeString(id);
  if (!normalizedId) {
    throw new Error("Provider id must not be empty.");
  }

  const providers = await readProviders();
  const next = providers.filter((provider) => provider.id !== normalizedId);
  if (next.length === providers.length) {
    throw new Error(`AI provider not found: ${id}`);
  }

  await writeProviders(next);
  return { status: "ok" };
}

export function resolveProviderConfig(
  provider: AiProvider,
  options?: { useReasoning?: boolean },
): {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
} {
  const useReasoning = options?.useReasoning === true;

  if (useReasoning) {
    const apiUrl = normalizeString(provider.reasoningApiUrl) || normalizeString(provider.fastApiUrl);
    const apiKey = normalizeString(provider.reasoningApiKey) || normalizeString(provider.fastApiKey);
    const model = normalizeString(provider.reasoningModel);

    if (!apiUrl || !apiKey || !model) {
      throw new Error(`Reasoning configuration is incomplete for provider: ${provider.id}`);
    }

    return {
      apiUrl,
      apiKey,
      model,
      maxTokens: provider.maxTokens,
    };
  }

  const apiUrl = normalizeString(provider.fastApiUrl);
  const apiKey = normalizeString(provider.fastApiKey);
  const model = normalizeString(provider.fastModel);

  if (!apiUrl || !apiKey || !model) {
    throw new Error(`Fast configuration is incomplete for provider: ${provider.id}`);
  }

  return {
    apiUrl,
    apiKey,
    model,
    maxTokens: provider.maxTokens,
  };
}

/**
 * URL + API key for OpenAI-compatible POST /v1/embeddings.
 * Tries the chat mode first (fast vs reasoning), then the other mode so
 * reasoning-only providers work when Fast is empty.
 */
export function resolveEmbeddingCredentials(
  provider: AiProvider,
  chatUsesReasoning?: boolean,
): { apiUrl: string; apiKey: string } | null {
  const prefersReasoning = chatUsesReasoning === true;
  const order: boolean[] = prefersReasoning ? [true, false] : [false, true];
  for (const useReasoning of order) {
    try {
      const cfg = resolveProviderConfig(provider, { useReasoning });
      return { apiUrl: cfg.apiUrl, apiKey: cfg.apiKey };
    } catch {
      // try alternate mode (e.g. reasoning-only when Fast is unset)
    }
  }
  return null;
}
