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
function countLines(content) {
    if (content.length === 0)
        return 0;
    return content.split(/\r\n|\r|\n/).length;
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
function ensureProjectRoot(projectRoot) {
    if (!projectRoot) {
        throw new Error('No project is currently open.');
    }
    return projectRoot;
}
function resolveProjectPath(projectRoot, relativePath) {
    const root = ensureProjectRoot(projectRoot);
    const segments = splitRelativePath(relativePath);
    const resolved = path.resolve(root, ...segments);
    const normalizedRoot = path.resolve(root);
    const relativeToRoot = path.relative(normalizedRoot, resolved);
    if (relativeToRoot.startsWith('..') ||
        path.isAbsolute(relativeToRoot)) {
        throw new Error(`Path escapes project root: ${relativePath}`);
    }
    return resolved;
}
async function readSubprojectType(directoryPath) {
    const markerPath = path.join(directoryPath, '.subproject.json');
    try {
        const raw = await fs.readFile(markerPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.type === 'string' && parsed.type.trim()) {
            return parsed.type;
        }
        if (typeof parsed.workspaceMode === 'string' && parsed.workspaceMode.trim()) {
            return parsed.workspaceMode;
        }
        return null;
    }
    catch {
        return null;
    }
}
async function buildFileNode(projectRoot, currentPath) {
    const stat = await fs.stat(currentPath);
    const relativePath = normalizeRelativePath(path.relative(projectRoot, currentPath));
    const name = relativePath ? path.basename(currentPath) : path.basename(projectRoot);
    if (!stat.isDirectory()) {
        return {
            name,
            path: relativePath,
            directory: false,
            children: null,
        };
    }
    const dirEntries = await fs.readdir(currentPath, { withFileTypes: true });
    const children = await Promise.all(dirEntries
        .filter((entry) => !entry.name.startsWith('.git'))
        .map((entry) => buildFileNode(projectRoot, path.join(currentPath, entry.name))));
    children.sort((a, b) => {
        if (a.directory !== b.directory)
            return a.directory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    const subprojectType = await readSubprojectType(currentPath);
    return {
        name,
        path: relativePath,
        directory: true,
        children,
        subprojectType,
    };
}
export async function getTree(projectRoot) {
    const root = ensureProjectRoot(projectRoot);
    return buildFileNode(root, root);
}
export async function getContent(projectRoot, relativePath) {
    const filePath = resolveProjectPath(projectRoot, relativePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
        throw new Error(`Not a file: ${relativePath}`);
    }
    const content = await fs.readFile(filePath, 'utf8');
    return {
        path: normalizeRelativePath(relativePath),
        content,
        lines: countLines(content),
    };
}
export async function saveContent(projectRoot, relativePath, content) {
    const filePath = resolveProjectPath(projectRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return { status: 'ok' };
}
export async function deleteContent(projectRoot, relativePath) {
    const targetPath = resolveProjectPath(projectRoot, relativePath);
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: false });
    }
    else {
        await fs.unlink(targetPath);
    }
    return {
        status: 'ok',
        path: normalizeRelativePath(relativePath),
    };
}
export async function createFile(projectRoot, parentPath, name) {
    const baseDir = parentPath
        ? resolveProjectPath(projectRoot, parentPath)
        : ensureProjectRoot(projectRoot);
    const targetPath = path.join(baseDir, name);
    const relative = normalizeRelativePath(path.relative(ensureProjectRoot(projectRoot), targetPath));
    if (await pathExists(targetPath)) {
        throw new Error(`File already exists: ${relative}`);
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, '', 'utf8');
    return {
        status: 'ok',
        path: relative,
    };
}
export async function createFolder(projectRoot, parentPath, name) {
    const baseDir = parentPath
        ? resolveProjectPath(projectRoot, parentPath)
        : ensureProjectRoot(projectRoot);
    const targetPath = path.join(baseDir, name);
    const relative = normalizeRelativePath(path.relative(ensureProjectRoot(projectRoot), targetPath));
    if (await pathExists(targetPath)) {
        throw new Error(`Folder already exists: ${relative}`);
    }
    await fs.mkdir(targetPath, { recursive: false });
    return {
        status: 'ok',
        path: relative,
    };
}
export async function renamePath(projectRoot, relativePath, newName) {
    const sourcePath = resolveProjectPath(projectRoot, relativePath);
    const targetPath = path.join(path.dirname(sourcePath), newName);
    const root = ensureProjectRoot(projectRoot);
    const targetRelative = normalizeRelativePath(path.relative(root, targetPath));
    if (await pathExists(targetPath)) {
        throw new Error(`Target already exists: ${targetRelative}`);
    }
    await fs.rename(sourcePath, targetPath);
    return {
        status: 'ok',
        path: targetRelative,
    };
}
export async function movePath(projectRoot, relativePath, targetParentPath) {
    const root = ensureProjectRoot(projectRoot);
    const sourcePath = resolveProjectPath(root, relativePath);
    const targetParent = targetParentPath
        ? resolveProjectPath(root, targetParentPath)
        : root;
    const targetPath = path.join(targetParent, path.basename(sourcePath));
    const targetRelative = normalizeRelativePath(path.relative(root, targetPath));
    if (await pathExists(targetPath)) {
        throw new Error(`Target already exists: ${targetRelative}`);
    }
    await fs.rename(sourcePath, targetPath);
    return {
        status: 'ok',
        path: targetRelative,
    };
}
//# sourceMappingURL=filesService.js.map