import { dialog, shell } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FileNode } from '../../src/shared/types.js';

export interface ProjectCurrentResult {
  path: string;
  hasProject: boolean;
  initialized: boolean;
}

export interface ProjectBrowseResult {
  cancelled: boolean;
  path?: string;
}

export interface ProjectOpenResult {
  status: string;
  path: string;
  tree: FileNode;
  initialized: boolean;
}

interface ProjectState {
  projectPath: string | null;
}

const state: ProjectState = {
  projectPath: null,
};

// ── Last-project persistence ──────────────────────────────────────────
// Main-process-owned (unlike the renderer's own localStorage copy) so the
// project is already open by the time any window — Buch, Pinnwand,
// Ereignisse, KI-Chat — is opened from the tray, not only after the Buch
// window happens to run its restore-on-mount effect.
const APP_DIR_NAME = '.writing-assistant';
const LAST_PROJECT_FILE_NAME = 'last-project.json';

function getAppDataDir(): string {
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  return path.join(os.homedir(), APP_DIR_NAME);
}

function getLastProjectFilePath(): string {
  return path.join(getAppDataDir(), LAST_PROJECT_FILE_NAME);
}

async function saveLastProjectPath(projectPath: string): Promise<void> {
  try {
    await fs.mkdir(getAppDataDir(), { recursive: true });
    await fs.writeFile(
      getLastProjectFilePath(),
      JSON.stringify({ path: projectPath }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error('[projectService] Failed to persist last project path:', err);
  }
}

async function loadLastProjectPath(): Promise<string | null> {
  try {
    const raw = await fs.readFile(getLastProjectFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as { path?: string };
    return parsed.path?.trim() || null;
  } catch {
    return null;
  }
}

function normalizeProjectPath(inputPath: string): string {
  return path.resolve(inputPath);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(targetPath: string): Promise<void> {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${targetPath}`);
  }
}

async function isInitializedProject(projectPath: string): Promise<boolean> {
  return exists(path.join(projectPath, '.assistant'));
}

async function buildFileNode(absPath: string, rootPath: string): Promise<FileNode> {
  const stat = await fs.stat(absPath);
  const relativePath = path.relative(rootPath, absPath).split(path.sep).join('/');

  if (!stat.isDirectory()) {
    return {
      name: path.basename(absPath),
      path: relativePath,
      directory: false,
      children: null,
      subprojectType: null,
    };
  }

  const entries = await fs.readdir(absPath, { withFileTypes: true });
  const children = await Promise.all(
    entries
      .filter((entry) => entry.name !== '.git')
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      })
      .map(async (entry) => {
        const childAbsPath = path.join(absPath, entry.name);
        return buildFileNode(childAbsPath, rootPath);
      }),
  );

  return {
    name: absPath === rootPath ? path.basename(rootPath) : path.basename(absPath),
    path: relativePath,
    directory: true,
    children,
    subprojectType: null,
  };
}

function requireProjectPath(): string {
  if (!state.projectPath) {
    throw new Error('No project is currently open.');
  }
  return state.projectPath;
}

export function getCurrentProjectPath(): string | null {
  return state.projectPath;
}

export async function getCurrentProject(): Promise<ProjectCurrentResult> {
  const projectPath = state.projectPath;
  if (!projectPath) {
    return {
      path: '',
      hasProject: false,
      initialized: false,
    };
  }

  return {
    path: projectPath,
    hasProject: true,
    initialized: await isInitializedProject(projectPath),
  };
}

export async function browseForProject(): Promise<ProjectBrowseResult> {
  const result = await dialog.showOpenDialog({
    title: 'Projektordner auswählen',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    path: normalizeProjectPath(result.filePaths[0]),
  };
}

export async function openProject(projectPath: string): Promise<ProjectOpenResult> {
  const normalizedPath = normalizeProjectPath(projectPath);

  if (!(await exists(normalizedPath))) {
    throw new Error(`Project path does not exist: ${normalizedPath}`);
  }

  await ensureDirectory(normalizedPath);

  state.projectPath = normalizedPath;
  await saveLastProjectPath(normalizedPath);

  return {
    status: 'ok',
    path: normalizedPath,
    tree: await buildFileNode(normalizedPath, normalizedPath),
    initialized: await isInitializedProject(normalizedPath),
  };
}

/**
 * Reopen the last-used project at app startup, before any window (tray menu
 * entries all assume `getCurrentProjectPath()` is already set). A missing or
 * no-longer-existing path is silently ignored — the user just sees the normal
 * "no project" state instead of a crash.
 */
export async function restoreLastProject(): Promise<void> {
  const last = await loadLastProjectPath();
  if (!last) return;
  try {
    await openProject(last);
  } catch (err) {
    console.error('[projectService] Failed to restore last project:', err);
  }
}

export async function revealProject(): Promise<{ status: string }> {
  const projectPath = requireProjectPath();
  await shell.openPath(projectPath);
  return { status: 'ok' };
}
