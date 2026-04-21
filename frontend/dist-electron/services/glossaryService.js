import { promises as fs } from 'node:fs';
import path from 'node:path';
const ASSISTANT_DIR = '.assistant';
const GLOSSARY_FILE = 'glossary.md';
function ensureProjectRoot(projectRoot) {
    if (!projectRoot) {
        throw new Error('No project is currently open.');
    }
    return projectRoot;
}
function getGlossaryPath(projectRoot) {
    const root = ensureProjectRoot(projectRoot);
    return path.join(root, ASSISTANT_DIR, GLOSSARY_FILE);
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
function normalizeLineEndings(input) {
    return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function normalizeTerm(term) {
    const value = term.trim();
    if (!value) {
        throw new Error('Glossary term must not be empty.');
    }
    return value;
}
function normalizeDefinition(definition) {
    const value = definition.trim();
    if (!value) {
        throw new Error('Glossary definition must not be empty.');
    }
    return value;
}
function escapeMarkdownInline(input) {
    return input.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}
function splitGlossaryContent(content) {
    const normalized = normalizeLineEndings(content);
    const lines = normalized.split('\n');
    const entries = [];
    const prefixLines = [];
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
        const definitionLines = [match[2] ?? ''];
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
            definition: definitionLines.join('\n').trim(),
        });
    }
    const remaining = lines.slice(index);
    if (remaining.length > 0) {
        if (prefixLines.length > 0 && prefixLines[prefixLines.length - 1] !== '') {
            prefixLines.push('');
        }
        prefixLines.push(...remaining);
    }
    return {
        prefixMarkdown: prefixLines.join('\n').trim(),
        entries,
    };
}
function buildGlossaryContent(prefixMarkdown, entries) {
    const normalizedPrefix = normalizeLineEndings(prefixMarkdown).trim();
    const entryBlocks = entries.map((entry) => {
        const safeTerm = escapeMarkdownInline(entry.term.trim());
        const normalizedDefinition = normalizeLineEndings(entry.definition).trim();
        if (normalizedDefinition.includes('\n')) {
            const definitionLines = normalizedDefinition.split('\n');
            const [firstLine, ...rest] = definitionLines;
            const continuation = rest.map((line) => `  ${line}`).join('\n');
            return continuation
                ? `- **${safeTerm}**: ${firstLine}\n${continuation}`
                : `- **${safeTerm}**: ${firstLine}`;
        }
        return `- **${safeTerm}**: ${normalizedDefinition}`;
    });
    const parts = [];
    if (normalizedPrefix) {
        parts.push(normalizedPrefix);
    }
    if (entryBlocks.length > 0) {
        parts.push(entryBlocks.join('\n'));
    }
    return parts.join('\n\n').trim();
}
async function readGlossaryFile(projectRoot) {
    const glossaryPath = getGlossaryPath(projectRoot);
    if (!(await pathExists(glossaryPath))) {
        return { exists: false, content: '' };
    }
    const content = await fs.readFile(glossaryPath, 'utf8');
    return {
        exists: true,
        content: normalizeLineEndings(content),
    };
}
async function writeGlossaryFile(projectRoot, content) {
    const glossaryPath = getGlossaryPath(projectRoot);
    await fs.mkdir(path.dirname(glossaryPath), { recursive: true });
    const normalized = normalizeLineEndings(content).trim();
    await fs.writeFile(glossaryPath, normalized.length > 0 ? `${normalized}\n` : '', 'utf8');
}
export async function getGlossary(projectRoot) {
    const { exists, content } = await readGlossaryFile(projectRoot);
    if (!exists) {
        return {
            content: '',
            exists: false,
            prefixMarkdown: '',
            entries: [],
        };
    }
    const parsed = splitGlossaryContent(content);
    return {
        content,
        exists: true,
        prefixMarkdown: parsed.prefixMarkdown,
        entries: parsed.entries,
    };
}
export async function replaceGlossary(projectRoot, content) {
    await writeGlossaryFile(projectRoot, content);
    return getGlossary(projectRoot);
}
export async function addGlossaryEntry(projectRoot, term, definition) {
    const normalizedTerm = normalizeTerm(term);
    const normalizedDefinition = normalizeDefinition(definition);
    const existing = await getGlossary(projectRoot);
    const prefixMarkdown = existing.prefixMarkdown ?? '';
    const entries = Array.isArray(existing.entries) ? [...existing.entries] : [];
    const existingIndex = entries.findIndex((entry) => entry.term.localeCompare(normalizedTerm, undefined, { sensitivity: 'accent' }) === 0);
    const nextEntry = {
        term: normalizedTerm,
        definition: normalizedDefinition,
    };
    if (existingIndex >= 0) {
        entries[existingIndex] = nextEntry;
    }
    else {
        entries.push(nextEntry);
    }
    entries.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    const content = buildGlossaryContent(prefixMarkdown, entries);
    await writeGlossaryFile(projectRoot, content);
    return {
        status: 'ok',
        entry: nextEntry,
    };
}
export async function deleteGlossaryEntry(projectRoot, term) {
    const normalizedTerm = normalizeTerm(term);
    const existing = await getGlossary(projectRoot);
    if (!existing.exists) {
        return {
            status: 'ok',
            deleted: false,
        };
    }
    const prefixMarkdown = existing.prefixMarkdown ?? '';
    const entries = Array.isArray(existing.entries) ? existing.entries : [];
    const nextEntries = entries.filter((entry) => entry.term.localeCompare(normalizedTerm, undefined, { sensitivity: 'accent' }) !== 0);
    if (nextEntries.length === entries.length) {
        return {
            status: 'ok',
            deleted: false,
        };
    }
    const content = buildGlossaryContent(prefixMarkdown, nextEntries);
    await writeGlossaryFile(projectRoot, content);
    return {
        status: 'ok',
        deleted: true,
    };
}
//# sourceMappingURL=glossaryService.js.map