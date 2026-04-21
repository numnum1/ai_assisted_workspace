import { promises as fs } from 'node:fs';
import path from 'node:path';
function normalizeRelativePath(relativePath) {
    return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}
function splitRelativePath(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized)
        return [];
    return normalized.split('/').filter(Boolean);
}
function ensureProjectRoot(projectRoot) {
    if (!projectRoot) {
        throw new Error('No project is currently open.');
    }
    return projectRoot;
}
function resolveProjectPath(projectRoot, relativePath) {
    const root = ensureProjectRoot(projectRoot);
    const resolved = path.resolve(root, ...splitRelativePath(relativePath));
    const normalizedRoot = path.resolve(root);
    const relativeToRoot = path.relative(normalizedRoot, resolved);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        throw new Error(`Path escapes project root: ${relativePath}`);
    }
    return resolved;
}
function getWikiRoot(projectRoot) {
    return resolveProjectPath(projectRoot, 'wiki');
}
async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
function isMarkdownFile(filePath) {
    return filePath.toLowerCase().endsWith('.md');
}
function inferTitle(relativeWikiPath, content) {
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
function buildSnippet(content, query) {
    const compact = content.replace(/\s+/g, ' ').trim();
    if (!compact)
        return '';
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
async function collectMarkdownFiles(rootPath, currentPath, acc) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const absPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules')
                continue;
            await collectMarkdownFiles(rootPath, absPath, acc);
            continue;
        }
        if (!entry.isFile())
            continue;
        if (!isMarkdownFile(entry.name))
            continue;
        const relativePath = normalizeRelativePath(path.relative(rootPath, absPath));
        acc.push(relativePath);
    }
}
export async function listWikiFiles(projectRoot) {
    const wikiRoot = getWikiRoot(projectRoot);
    if (!(await pathExists(wikiRoot))) {
        return [];
    }
    const stat = await fs.stat(wikiRoot);
    if (!stat.isDirectory()) {
        throw new Error('wiki exists but is not a directory.');
    }
    const files = [];
    await collectMarkdownFiles(wikiRoot, wikiRoot, files);
    files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return files;
}
export async function readWikiFile(projectRoot, relativeWikiPath) {
    const wikiRoot = getWikiRoot(projectRoot);
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
export async function searchWiki(projectRoot, query, limit = 20) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery)
        return [];
    const wikiFiles = await listWikiFiles(projectRoot);
    const wikiRoot = getWikiRoot(projectRoot);
    const normalizedQuery = trimmedQuery.toLowerCase();
    const results = [];
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
//# sourceMappingURL=wikiService.js.map