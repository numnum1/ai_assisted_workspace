import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WikiSearchResult {
  path: string;
  title: string;
  snippet: string;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function splitRelativePath(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return [];
  return normalized.split('/').filter(Boolean);
}

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error('No project is currently open.');
  }
  return projectRoot;
}


async function getWikiRoot(projectRoot: string | null): Promise<string> {
  const root = ensureProjectRoot(projectRoot);
  const subDir = path.join(root, 'wiki');
  try {
    const stat = await fs.stat(subDir);
    if (stat.isDirectory()) return subDir;
  } catch {
    // no wiki subdirectory — use project root directly
  }
  return root;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

function inferTitle(relativeWikiPath: string, content: string): string {
  const lines = content.split(/\r\n|\r|\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim() || path.basename(relativeWikiPath, '.md');
    }
  }

  for (const line of lines.slice(0, 20)) {
    const match = /^\s*name\s*:\s*(.+)\s*$/i.exec(line);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return path.basename(relativeWikiPath, '.md');
}

function buildSnippet(content: string, query: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return compact.slice(0, 180);
  }

  const haystack = compact.toLowerCase();
  const index = haystack.indexOf(normalizedQuery);

  if (index < 0) {
    return compact.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(compact.length, index + normalizedQuery.length + 120);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < compact.length ? '…' : '';

  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

async function collectMarkdownFiles(
  rootPath: string,
  currentPath: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      await collectMarkdownFiles(rootPath, absPath, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!isMarkdownFile(entry.name)) continue;

    const relativePath = normalizeRelativePath(path.relative(rootPath, absPath));
    acc.push(relativePath);
  }
}

export async function listWikiFiles(projectRoot: string | null): Promise<string[]> {
  const wikiRoot = await getWikiRoot(projectRoot);
  if (!(await pathExists(wikiRoot))) {
    return [];
  }

  const stat = await fs.stat(wikiRoot);
  if (!stat.isDirectory()) {
    throw new Error('wiki exists but is not a directory.');
  }

  const files: string[] = [];
  await collectMarkdownFiles(wikiRoot, wikiRoot, files);

  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return files;
}

export async function readWikiFile(
  projectRoot: string | null,
  relativeWikiPath: string,
): Promise<{ path: string; content: string }> {
  const wikiRoot = await getWikiRoot(projectRoot);
  const targetPath = path.resolve(wikiRoot, ...splitRelativePath(relativeWikiPath));
  const relativeToRoot = path.relative(wikiRoot, targetPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Wiki path escapes wiki root: ${relativeWikiPath}`);
  }

  if (!isMarkdownFile(targetPath)) {
    throw new Error('Wiki only supports Markdown files.');
  }

  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error(`Wiki path is not a file: ${relativeWikiPath}`);
  }

  const content = await fs.readFile(targetPath, 'utf8');

  return {
    path: normalizeRelativePath(relativeWikiPath),
    content,
  };
}

export interface WikiIndexEntry {
  path: string;
  category: string;
  name: string;
  summary: string;
  aliases: string[];
}

/** Minimal YAML-frontmatter extraction — no external dependency. */
function parseFrontmatter(content: string): Record<string, string> {
  const match = /^﻿?\s*---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const block = match[1];
  const result: Record<string, string> = {};
  for (const line of block.split(/\r\n|\r|\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    result[kv[1].toLowerCase()] = kv[2].trim();
  }
  return result;
}

function parseAliases(raw: string | undefined): string[] {
  if (!raw) return [];
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function categoryOf(relativePath: string): string {
  const parts = splitRelativePath(relativePath);
  return parts.length > 1 ? parts[0] : '(Stammverzeichnis)';
}

/**
 * Build a compact inventory of every wiki entry — the writing equivalent of a
 * source tree. Each entry contributes one line (name, path, summary, aliases),
 * grouped by top-level category. Summary comes from frontmatter; name falls
 * back to the first heading so it works on wikis without frontmatter.
 */
export async function buildWikiIndex(
  projectRoot: string | null,
): Promise<WikiIndexEntry[]> {
  let wikiFiles: string[];
  try {
    wikiFiles = await listWikiFiles(projectRoot);
  } catch {
    return [];
  }
  const wikiRoot = await getWikiRoot(projectRoot);
  const entries: WikiIndexEntry[] = [];

  for (const relativePath of wikiFiles) {
    // Skip per-category README/templates — they describe format, not entities.
    if (/(^|\/)readme\.md$/i.test(relativePath)) continue;

    const absPath = path.join(wikiRoot, ...splitRelativePath(relativePath));
    let content = '';
    try {
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    entries.push({
      path: `wiki/${relativePath}`,
      category: categoryOf(relativePath),
      name: inferTitle(relativePath, content),
      summary: fm.summary ?? '',
      aliases: parseAliases(fm.aliases),
    });
  }

  return entries;
}

/**
 * Render the wiki inventory as a token-bounded text block for the system prompt.
 * Below the budget every entry gets a full line; above it the index degrades to
 * category + count so a large wiki never blows the context window.
 */
export function formatWikiIndex(
  entries: WikiIndexEntry[],
  maxChars = 5000,
): string {
  if (entries.length === 0) return '';

  const byCategory = new Map<string, WikiIndexEntry[]>();
  for (const entry of entries) {
    const bucket = byCategory.get(entry.category);
    if (bucket) bucket.push(entry);
    else byCategory.set(entry.category, [entry]);
  }
  const categories = [...byCategory.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const full: string[] = [];
  for (const category of categories) {
    full.push(`${category}/`);
    for (const entry of byCategory.get(category)!) {
      const summary = entry.summary ? ` — ${entry.summary}` : '';
      const aliases =
        entry.aliases.length > 0 ? ` [alias: ${entry.aliases.join(', ')}]` : '';
      full.push(`  - ${entry.name} (${entry.path})${summary}${aliases}`);
    }
  }
  const fullText = full.join('\n');
  if (fullText.length <= maxChars) return fullText;

  // Too large — degrade to category counts only.
  return categories
    .map((category) => `${category}/ — ${byCategory.get(category)!.length} Einträge`)
    .join('\n');
}

export async function searchWiki(
  projectRoot: string | null,
  query: string,
  limit = 20,
): Promise<WikiSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const wikiFiles = await listWikiFiles(projectRoot);
  const wikiRoot = await getWikiRoot(projectRoot);
  const normalizedQuery = trimmedQuery.toLowerCase();
  const results: WikiSearchResult[] = [];

  for (const relativePath of wikiFiles) {
    const absPath = path.join(wikiRoot, ...splitRelativePath(relativePath));
    const content = await fs.readFile(absPath, 'utf8');
    const haystack = content.toLowerCase();

    if (!haystack.includes(normalizedQuery)) {
      continue;
    }

    results.push({
      path: relativePath,
      title: inferTitle(relativePath, content),
      snippet: buildSnippet(content, trimmedQuery),
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
