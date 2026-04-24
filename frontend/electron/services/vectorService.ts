import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model?: string;
}

export interface SemanticHit {
  filePath: string;
  scope: "project" | "wiki";
  snippet: string;
  score: number;
}

export interface SemanticSearchResult {
  hits: SemanticHit[];
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface IndexStatus {
  indexed: boolean;
  indexedAt: string | null;
  chunkCount: number;
  embeddingModel: string | null;
}

interface VectorChunk {
  id: string;
  filePath: string;
  scope: "project" | "wiki";
  chunkIndex: number;
  text: string;
  embedding: number[];
  fileMtime: number;
}

interface VectorIndex {
  projectPath: string;
  indexedAt: string;
  embeddingModel: string;
  chunkCount: number;
  chunks: VectorChunk[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_DIR = ".writing-assistant";
const VECTOR_INDEX_DIR = "vector-index";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 50;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  ".idea",
  ".cursor",
  ".zed",
  ".assistant",
]);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getIndexDir(): string {
  return path.join(os.homedir(), APP_DIR, VECTOR_INDEX_DIR);
}

function projectHash(projectPath: string): string {
  return crypto
    .createHash("sha1")
    .update(projectPath)
    .digest("hex")
    .slice(0, 16);
}

function getIndexPath(projectPath: string): string {
  return path.join(getIndexDir(), `${projectHash(projectPath)}.json`);
}

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 20) {
      chunks.push(chunk);
    }
    if (end >= normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

interface FileEntry {
  absPath: string;
  relativePath: string;
  scope: "project" | "wiki";
}

async function collectFiles(
  root: string,
  currentPath: string,
  out: FileEntry[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const absPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(root, absPath, out);
      continue;
    }

    if (!entry.isFile()) continue;

    const rel = path.relative(root, absPath).split(path.sep).join("/");
    const scope: "project" | "wiki" = rel.startsWith("wiki/") ? "wiki" : "project";
    out.push({ absPath, relativePath: rel, scope });
  }
}

// ---------------------------------------------------------------------------
// Embedding API
// ---------------------------------------------------------------------------

async function fetchEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  const model = config.model ?? DEFAULT_EMBEDDING_MODEL;
  const baseUrl = config.apiUrl.replace(/\/$/, "");
  const url = `${baseUrl}/v1/embeddings`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((entry) => entry.embedding);
}

// ---------------------------------------------------------------------------
// Index I/O
// ---------------------------------------------------------------------------

async function loadIndex(projectPath: string): Promise<VectorIndex | null> {
  try {
    const raw = await fs.readFile(getIndexPath(projectPath), "utf8");
    return JSON.parse(raw) as VectorIndex;
  } catch {
    return null;
  }
}

async function saveIndex(projectPath: string, index: VectorIndex): Promise<void> {
  await fs.mkdir(getIndexDir(), { recursive: true });
  await fs.writeFile(getIndexPath(projectPath), JSON.stringify(index), "utf8");
}

// ---------------------------------------------------------------------------
// Keyword fallback
// ---------------------------------------------------------------------------

async function keywordSearchFallback(
  projectPath: string,
  query: string,
  scope: "project" | "wiki" | "all",
  limit: number,
): Promise<SemanticHit[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const files: FileEntry[] = [];
  await collectFiles(projectPath, projectPath, files);

  const results: SemanticHit[] = [];

  for (const file of files) {
    if (results.length >= limit) break;
    if (scope !== "all" && file.scope !== scope) continue;

    let content: string;
    try {
      content = await fs.readFile(file.absPath, "utf8");
    } catch {
      continue;
    }

    const lower = content.toLowerCase();
    const idx = lower.indexOf(trimmed);
    if (idx < 0) continue;

    const compact = content.replace(/\s+/g, " ").trim();
    const compactLower = compact.toLowerCase();
    const compactIdx = compactLower.indexOf(trimmed);
    const start = Math.max(0, compactIdx - 60);
    const end = Math.min(compact.length, compactIdx + trimmed.length + 140);
    const snippet = `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;

    results.push({ filePath: file.relativePath, scope: file.scope, snippet, score: 0 });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getIndexStatus(projectPath: string): Promise<IndexStatus> {
  console.trace(`[vector] getIndexStatus: ${projectPath}`);
  const index = await loadIndex(projectPath);
  if (!index) {
    return { indexed: false, indexedAt: null, chunkCount: 0, embeddingModel: null };
  }
  console.trace(`[vector] getIndexStatus: indexed, ${index.chunkCount} chunks, model=${index.embeddingModel}`);
  return {
    indexed: true,
    indexedAt: index.indexedAt,
    chunkCount: index.chunkCount,
    embeddingModel: index.embeddingModel,
  };
}

export async function indexProject(
  projectPath: string,
  config: EmbeddingConfig,
): Promise<IndexStatus> {
  console.trace(`[vector] indexProject start: ${projectPath}`);

  const model = config.model ?? DEFAULT_EMBEDDING_MODEL;
  const files: FileEntry[] = [];
  await collectFiles(projectPath, projectPath, files);

  console.trace(`[vector] indexProject: ${files.length} files collected`);

  type PendingChunk = {
    text: string;
    filePath: string;
    scope: "project" | "wiki";
    chunkIndex: number;
    fileMtime: number;
  };

  const pending: PendingChunk[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file.absPath, "utf8");
    } catch {
      continue;
    }

    let mtime = 0;
    try {
      mtime = (await fs.stat(file.absPath)).mtimeMs;
    } catch {
      // ignore
    }

    const chunks = chunkText(content);
    for (let i = 0; i < chunks.length; i++) {
      pending.push({
        text: chunks[i] ?? "",
        filePath: file.relativePath,
        scope: file.scope,
        chunkIndex: i,
        fileMtime: mtime,
      });
    }
  }

  console.trace(`[vector] indexProject: ${pending.length} chunks to embed`);

  const vectorChunks: VectorChunk[] = [];
  const totalBatches = Math.ceil(pending.length / EMBED_BATCH_SIZE);

  for (let batchStart = 0; batchStart < pending.length; batchStart += EMBED_BATCH_SIZE) {
    const batch = pending.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
    const embeddings = await fetchEmbeddings(
      batch.map((c) => c.text),
      { ...config, model },
    );

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (!item) continue;
      vectorChunks.push({
        id: `${item.filePath}::${item.chunkIndex}`,
        filePath: item.filePath,
        scope: item.scope,
        chunkIndex: item.chunkIndex,
        text: item.text,
        embedding: embeddings[i] ?? [],
        fileMtime: item.fileMtime,
      });
    }

    const batchNum = Math.floor(batchStart / EMBED_BATCH_SIZE) + 1;
    console.trace(`[vector] indexProject: embedded batch ${batchNum}/${totalBatches}`);
  }

  const index: VectorIndex = {
    projectPath,
    indexedAt: new Date().toISOString(),
    embeddingModel: model,
    chunkCount: vectorChunks.length,
    chunks: vectorChunks,
  };

  await saveIndex(projectPath, index);

  console.trace(`[vector] indexProject done: ${vectorChunks.length} chunks stored`);

  return {
    indexed: true,
    indexedAt: index.indexedAt,
    chunkCount: index.chunkCount,
    embeddingModel: index.embeddingModel,
  };
}

export async function semanticSearch(
  projectPath: string,
  query: string,
  config: EmbeddingConfig,
  options?: { limit?: number; scope?: "project" | "wiki" | "all" },
): Promise<SemanticSearchResult> {
  const limit = options?.limit ?? 10;
  const scope = options?.scope ?? "all";

  console.trace(`[vector] semanticSearch: query="${query}" scope=${scope} limit=${limit}`);

  const index = await loadIndex(projectPath);

  if (!index) {
    console.trace(`[vector] semanticSearch: no index found, using keyword fallback`);
    const hits = await keywordSearchFallback(projectPath, query, scope, limit);
    return { hits, usedFallback: true, fallbackReason: "no_index" };
  }

  let queryEmbedding: number[];
  try {
    [queryEmbedding] = await fetchEmbeddings([query], config);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.trace(`[vector] semanticSearch: embedding API failed (${reason}), using keyword fallback`);
    const hits = await keywordSearchFallback(projectPath, query, scope, limit);
    return { hits, usedFallback: true, fallbackReason: `embedding_error: ${reason}` };
  }

  let candidates = index.chunks;
  if (scope !== "all") {
    candidates = candidates.filter((c) => c.scope === scope);
  }

  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const hits: SemanticHit[] = scored.map(({ chunk, score }) => {
    const snippet = chunk.text.length > 300 ? `${chunk.text.slice(0, 300)}…` : chunk.text;
    return {
      filePath: chunk.filePath,
      scope: chunk.scope,
      snippet,
      score: Math.round(score * 1000) / 1000,
    };
  });

  console.trace(`[vector] semanticSearch done: ${hits.length} results (semantic)`);

  return { hits, usedFallback: false };
}
