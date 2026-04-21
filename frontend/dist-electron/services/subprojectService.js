import { promises as fs } from 'node:fs';
import path from 'node:path';
const SUBPROJECT_MARKER_FILE = '.subproject.json';
function normalizeRelativePath(relativePath) {
    return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}
function ensureProjectRoot(projectRoot) {
    if (!projectRoot) {
        throw new Error('No project is currently open.');
    }
    return projectRoot;
}
function splitRelativePath(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized)
        return [];
    return normalized.split('/').filter(Boolean);
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
async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function readMarker(markerPath) {
    try {
        const raw = await fs.readFile(markerPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        return null;
    }
}
async function ensureDirectory(targetPath) {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
    }
}
function normalizeType(type) {
    const value = type.trim();
    if (!value) {
        throw new Error('Subproject type must not be empty.');
    }
    return value;
}
function normalizeName(name) {
    const value = name.trim();
    if (!value) {
        throw new Error('Subproject name must not be empty.');
    }
    return value;
}
export async function getSubprojectInfo(projectRoot, relativePath) {
    const folderPath = resolveProjectPath(projectRoot, relativePath);
    await ensureDirectory(folderPath);
    const marker = await readMarker(path.join(folderPath, SUBPROJECT_MARKER_FILE));
    if (!marker) {
        return { subproject: false };
    }
    const type = typeof marker.type === 'string' && marker.type.trim()
        ? marker.type.trim()
        : typeof marker.workspaceMode === 'string' && marker.workspaceMode.trim()
            ? marker.workspaceMode.trim()
            : undefined;
    const name = typeof marker.name === 'string' && marker.name.trim()
        ? marker.name.trim()
        : path.basename(folderPath);
    return {
        subproject: Boolean(type),
        type,
        name,
    };
}
export async function initSubproject(projectRoot, relativePath, type, name) {
    const folderPath = resolveProjectPath(projectRoot, relativePath);
    await ensureDirectory(folderPath);
    const markerPath = path.join(folderPath, SUBPROJECT_MARKER_FILE);
    const marker = {
        type: normalizeType(type),
        workspaceMode: normalizeType(type),
        name: normalizeName(name),
    };
    await fs.writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    return { status: 'ok' };
}
export async function removeSubproject(projectRoot, relativePath) {
    const folderPath = resolveProjectPath(projectRoot, relativePath);
    await ensureDirectory(folderPath);
    const markerPath = path.join(folderPath, SUBPROJECT_MARKER_FILE);
    if (!(await pathExists(markerPath))) {
        return { status: 'ok' };
    }
    await fs.unlink(markerPath);
    return { status: 'ok' };
}
//# sourceMappingURL=subprojectService.js.map