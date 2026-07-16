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

async function collectFolders(
  rootPath: string,
  currentPath: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const absPath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootPath, absPath));
    acc.push(relativePath);
    await collectFolders(rootPath, absPath, acc);
  }
}

/** Every folder in the wiki, including empty ones (listWikiFiles only surfaces folders that contain a .md file). */
export async function listWikiFolders(projectRoot: string | null): Promise<string[]> {
  const wikiRoot = await getWikiRoot(projectRoot);
  if (!(await pathExists(wikiRoot))) {
    return [];
  }

  const stat = await fs.stat(wikiRoot);
  if (!stat.isDirectory()) {
    throw new Error('wiki exists but is not a directory.');
  }

  const folders: string[] = [];
  await collectFolders(wikiRoot, wikiRoot, folders);

  folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return folders;
}

export async function createWikiFolder(
  projectRoot: string | null,
  parentRelativePath: string,
  name: string,
): Promise<{ path: string }> {
  if (!name.trim() || name.includes('/') || name.includes('\\')) {
    throw new Error('Ungültiger Ordnername.');
  }

  const wikiRoot = await getWikiRoot(projectRoot);
  const parentPath = path.resolve(wikiRoot, ...splitRelativePath(parentRelativePath));
  const relativeToRoot = path.relative(wikiRoot, parentPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Wiki path escapes wiki root: ${parentRelativePath}`);
  }

  const targetPath = path.join(parentPath, name);
  if (await pathExists(targetPath)) {
    throw new Error(`Ordner existiert bereits: ${name}`);
  }

  await fs.mkdir(targetPath, { recursive: false });

  return { path: normalizeRelativePath(path.relative(wikiRoot, targetPath)) };
}

export async function createWikiFile(
  projectRoot: string | null,
  parentRelativePath: string,
  name: string,
): Promise<{ path: string }> {
  if (!name.trim() || name.includes('/') || name.includes('\\')) {
    throw new Error('Ungültiger Dateiname.');
  }
  if (!parentRelativePath.trim()) {
    throw new Error('Wiki-Einträge dürfen nur innerhalb eines Ordners angelegt werden.');
  }

  const fileName = isMarkdownFile(name) ? name : `${name}.md`;

  const wikiRoot = await getWikiRoot(projectRoot);
  const parentPath = path.resolve(wikiRoot, ...splitRelativePath(parentRelativePath));
  const relativeToRoot = path.relative(wikiRoot, parentPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Wiki path escapes wiki root: ${parentRelativePath}`);
  }

  const targetPath = path.join(parentPath, fileName);
  if (await pathExists(targetPath)) {
    throw new Error(`Datei existiert bereits: ${fileName}`);
  }

  await fs.mkdir(parentPath, { recursive: true });
  await fs.writeFile(targetPath, '', 'utf8');

  return { path: normalizeRelativePath(path.relative(wikiRoot, targetPath)) };
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
  /**
   * Owner this entry is linked to, from the `attachedTo` frontmatter key. A
   * "metafile" is just a wiki entry attached to a structure node
   * (`chapter:<id>`, `scene:<cid>:<sid>`, `action:<cid>:<sid>:<aid>`, `book`) or
   * to the timeline workspace (`arc:<id>`, `arcpoint:<id>`). Undefined for
   * free-standing lore entries.
   */
  attachedTo?: string;
}

/** Minimal YAML-frontmatter extraction — no external dependency. */
function parseFrontmatter(content: string): Record<string, string> {
  const match = /^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content);
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
      ...(fm.attachedto ? { attachedTo: fm.attachedto } : {}),
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
      const attached = entry.attachedTo ? ` [↳ ${entry.attachedTo}]` : '';
      full.push(`  - ${entry.name} (${entry.path})${summary}${aliases}${attached}`);
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

// ── Attached notes (metafiles / timeline notes) ──────────────────────────────
// A "metafile" is a normal wiki entry that declares an owner via `attachedTo`
// frontmatter. It is stored, indexed, read and written exactly like any other
// wiki file — the only difference is the link. The same mechanism serves the
// book structure (chapter/scene/action/book) and the timeline (arc/arcpoint).

/** Owner-type → wiki subfolder for newly created attached notes. */
function categoryForOwner(ownerRef: string): string {
  const type = ownerRef.split(':')[0];
  switch (type) {
    case 'book':
      return 'buch';
    case 'chapter':
      return 'kapitel';
    case 'scene':
      return 'szene';
    case 'action':
      return 'handlung';
    case 'arc':
      return 'arc';
    case 'arcpoint':
      return 'arcpunkt';
    default:
      return 'notizen';
  }
}

const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'notiz';
}

export interface AttachedNote {
  path: string;
  name: string;
  summary: string;
}

/** The wiki entry linked to `ownerRef`, or null if the node/timeline has no metafile yet. */
export async function getAttachedNote(
  projectRoot: string | null,
  ownerRef: string,
): Promise<AttachedNote | null> {
  const target = ownerRef.trim();
  if (!target) return null;
  const entries = await buildWikiIndex(projectRoot);
  const hit = entries.find((entry) => entry.attachedTo === target);
  if (!hit) return null;
  return { path: hit.path, name: hit.name, summary: hit.summary };
}

/**
 * Ensure a metafile exists for `ownerRef` and return its path. If one is already
 * attached, that one is returned (never a duplicate); otherwise a fresh wiki
 * markdown file with `attachedTo` frontmatter is created under a type-specific
 * category folder.
 */
export async function createAttachedNote(
  projectRoot: string | null,
  ownerRef: string,
  title: string,
): Promise<{ path: string }> {
  const target = ownerRef.trim();
  if (!target) {
    throw new Error('Kein Ziel für die Metafile angegeben.');
  }

  const existing = await getAttachedNote(projectRoot, target);
  if (existing) return { path: existing.path };

  const root = ensureProjectRoot(projectRoot);
  const category = categoryForOwner(target);
  const cleanTitle = title.trim() || target;
  const baseSlug = slugify(cleanTitle);

  const dir = path.join(root, 'wiki', category);
  await fs.mkdir(dir, { recursive: true });

  let filename = `${baseSlug}.md`;
  let counter = 2;
  while (await pathExists(path.join(dir, filename))) {
    filename = `${baseSlug}-${counter}.md`;
    counter += 1;
  }

  const body = [
    '---',
    `title: ${cleanTitle}`,
    'summary: ',
    `attachedTo: ${target}`,
    '---',
    '',
    `# ${cleanTitle}`,
    '',
  ].join('\n');

  await fs.writeFile(path.join(dir, filename), body, 'utf8');
  return { path: `wiki/${category}/${filename}` };
}
