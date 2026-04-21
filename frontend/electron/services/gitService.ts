import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

const APP_DIR_NAME = ".writing-assistant";
const GIT_CREDENTIALS_FILE = "git-credentials.json";

export interface GitCredentials {
  username: string;
  token: string;
}

export interface GitStatusPayload {
  isRepo: boolean;
  added?: string[];
  modified?: string[];
  removed?: string[];
  untracked?: string[];
  changed?: string[];
  missing?: string[];
  isClean?: boolean;
}

export interface GitCommitPayload {
  hash: string;
  message: string;
  author: string;
  date: string;
}

function logTrace(msg: string): void {
  console.log(`[gitService] ${msg}`);
}

function getCredentialsPath(): string {
  return path.join(os.homedir(), APP_DIR_NAME, GIT_CREDENTIALS_FILE);
}

async function ensureAppDir(): Promise<void> {
  await fs.mkdir(path.join(os.homedir(), APP_DIR_NAME), { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findGitWorkTree(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  while (true) {
    const gitMarker = path.join(dir, ".git");
    if (await pathExists(gitMarker)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function computePrefix(workTree: string, projectPath: string): string {
  const wt = path.resolve(workTree);
  const proj = path.resolve(projectPath);
  if (wt === proj) {
    return "";
  }
  let rel: string;
  try {
    rel = path.relative(wt, proj);
  } catch {
    return "";
  }
  if (rel.startsWith("..")) {
    return "";
  }
  const n = rel.replace(/\\/g, "/");
  return n === "" ? "" : `${n}/`;
}

function stripRepoPrefix(repoPath: string, prefix: string): string | null {
  const n = repoPath.replace(/\\/g, "/");
  if (!prefix) {
    return n;
  }
  const dirPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (n === dirPrefix) {
    return "";
  }
  if (n.startsWith(prefix)) {
    return n.slice(prefix.length);
  }
  return null;
}

function filterAndStrip(paths: string[], prefix: string): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const stripped = stripRepoPrefix(p, prefix);
    if (stripped !== null) {
      out.push(stripped);
    }
  }
  return out;
}

async function loadCredentials(): Promise<GitCredentials> {
  const filePath = getCredentialsPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      return {
        username: typeof o.username === "string" ? o.username : "",
        token: typeof o.token === "string" ? o.token : "",
      };
    }
  } catch {
    /* missing or invalid */
  }
  return { username: "", token: "" };
}

function authConfigForRemote(
  remoteUrl: string,
  username: string,
  token: string,
): string[] {
  const t = token.trim();
  if (!t) {
    return [];
  }
  try {
    const u = new URL(remoteUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return [];
    }
    const user = username.trim() || "token";
    const basic = Buffer.from(`${user}:${t}`, "utf8").toString("base64");
    return [`http.extraHeader=Authorization: Basic ${basic}`];
  } catch {
    return [];
  }
}

function makeGit(workTree: string, extraConfig?: string[]): SimpleGit {
  return simpleGit({
    baseDir: workTree,
    ...(extraConfig?.length ? { config: extraConfig } : {}),
  });
}

async function getOriginUrl(workTree: string): Promise<string> {
  const g = simpleGit({ baseDir: workTree });
  try {
    const url = await g.remote(["get-url", "origin"]);
    return typeof url === "string" ? url.trim() : "";
  } catch {
    return "";
  }
}

function isAuthErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("authentication is required") ||
    m.includes("not authorized") ||
    m.includes("credentials") ||
    m.includes("401") ||
    m.includes("access denied") ||
    m.includes("could not read username")
  );
}

function throwAuthRequired(cause: unknown): never {
  const msg = cause instanceof Error ? cause.message : String(cause);
  if (isAuthErrorMessage(msg)) {
    logTrace(`Finished with auth error → auth_required (${msg})`);
    throw new Error("auth_required");
  }
  if (cause instanceof Error) {
    throw cause;
  }
  throw new Error(String(cause));
}

async function withOptionalRemoteAuth<T>(
  workTree: string,
  run: (git: SimpleGit) => Promise<T>,
): Promise<T> {
  const creds = await loadCredentials();
  const remoteUrl = await getOriginUrl(workTree);
  const cfg = authConfigForRemote(remoteUrl, creds.username, creds.token);
  const git = cfg.length ? makeGit(workTree, cfg) : makeGit(workTree);
  try {
    return await run(git);
  } catch (e) {
    throwAuthRequired(e);
  }
}

function normalizeProjectDirPath(dirPath: string): string {
  if (dirPath == null || dirPath.trim() === "") {
    return ".";
  }
  const n = dirPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return n === "" ? "." : n;
}

function repoBasePathForRevertScope(prefix: string, normalizedProjectDir: string): string {
  const pfx = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (normalizedProjectDir === ".") {
    return pfx;
  }
  return pfx === "" ? normalizedProjectDir : `${pfx}/${normalizedProjectDir}`;
}

function pathUnderRepoBase(repoPath: string, repoBase: string): boolean {
  const n = repoPath.replace(/\\/g, "/");
  if (repoBase === "") {
    return true;
  }
  return n === repoBase || n.startsWith(`${repoBase}/`);
}

async function deletePathRecursive(abs: string): Promise<void> {
  try {
    const stat = await fs.stat(abs);
    if (stat.isFile() || stat.isSymbolicLink()) {
      await fs.unlink(abs);
      return;
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      for (const ent of entries) {
        await deletePathRecursive(path.join(abs, ent.name));
      }
      await fs.rmdir(abs);
    }
  } catch {
    /* ignore missing */
  }
}

export async function setGitCredentials(
  username: string,
  token: string,
): Promise<{ status: string }> {
  logTrace(
    `Received request setGitCredentials for user=${username ? "(set)" : "(empty)"}`,
  );
  await ensureAppDir();
  await fs.writeFile(
    getCredentialsPath(),
    JSON.stringify({ username, token }, null, 2),
    "utf8",
  );
  logTrace("Finished setGitCredentials: ok");
  return { status: "ok" };
}

export async function gitIsRepo(projectPath: string | null): Promise<boolean> {
  if (!projectPath) {
    return false;
  }
  return (await findGitWorkTree(projectPath)) != null;
}

export async function gitStatus(
  projectPath: string | null,
): Promise<GitStatusPayload> {
  logTrace("Received request gitStatus");
  if (!projectPath) {
    logTrace("Finished gitStatus: no project");
    return { isRepo: false };
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    logTrace("Finished gitStatus: not a git repository");
    return { isRepo: false };
  }
  const prefix = computePrefix(workTree, projectPath);
  const git = makeGit(workTree);
  const s = await git.status();
  const toNorm = (arr: string[] | undefined) =>
    filterAndStrip((arr ?? []).map((p) => p.replace(/\\/g, "/")), prefix);

  const added = toNorm(s.created);
  const modified = toNorm(s.modified);
  const untracked = toNorm(s.not_added);
  const missing = toNorm(s.deleted);
  const changed = toNorm(s.conflicted);
  const removed: string[] = [];

  const isClean =
    added.length === 0 &&
    modified.length === 0 &&
    removed.length === 0 &&
    untracked.length === 0 &&
    changed.length === 0 &&
    missing.length === 0;

  logTrace(
    `Finished gitStatus: clean=${isClean}, modified=${modified.length}, untracked=${untracked.length}`,
  );
  return {
    isRepo: true,
    added,
    modified,
    removed,
    untracked,
    changed,
    missing,
    isClean,
  };
}

export async function gitCommit(
  projectPath: string | null,
  message: string,
  files?: string[] | null,
): Promise<{ hash: string; message: string }> {
  logTrace(`Received request gitCommit message=${message.slice(0, 80)}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const prefix = computePrefix(workTree, projectPath);
  const git = makeGit(workTree);

  if (files == null || files.length === 0) {
    const st = await git.status();
    const collect: string[] = [];
    const addAll = (arr: string[] | undefined) => {
      for (const f of arr ?? []) {
        collect.push(f.replace(/\\/g, "/"));
      }
    };
    addAll(st.modified);
    addAll(st.deleted);
    addAll(st.not_added);
    addAll(st.conflicted);
    addAll(st.created);
    const stagedPaths = new Set<string>();
    for (const row of st.files ?? []) {
      if (row.path) {
        stagedPaths.add(row.path.replace(/\\/g, "/"));
      }
    }
    addAll([...stagedPaths]);
    if (collect.length === 0) {
      const pattern = prefix === "" ? "." : prefix.replace(/\/+$/, "");
      await git.add(pattern);
    } else {
      for (const f of collect) {
        await git.add(prefix === "" ? f : `${prefix}${f}`);
      }
    }
  } else {
    for (const f of files) {
      const rel = f.replace(/\\/g, "/");
      await git.add(prefix === "" ? rel : `${prefix}${rel}`);
    }
  }

  const result = await git.commit(message);
  const hash = result.commit ?? "";
  logTrace(`Finished gitCommit: hash=${hash}`);
  return { hash, message };
}

export async function gitRevertFile(
  projectPath: string | null,
  filePath: string,
  untracked: boolean,
): Promise<{ status: string }> {
  logTrace(`Received request gitRevertFile path=${filePath} untracked=${untracked}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const prefix = computePrefix(workTree, projectPath);
  const fullPath = `${prefix}${filePath.replace(/\\/g, "/")}`;
  if (untracked) {
    const abs = path.join(workTree, fullPath);
    await fs.unlink(abs).catch(() => {
      /* ignore */
    });
  } else {
    const git = makeGit(workTree);
    await git.raw(["reset", "HEAD", "--", fullPath]);
    await git.raw(["checkout", "HEAD", "--", fullPath]);
  }
  logTrace(`Finished gitRevertFile: path=${filePath}`);
  return { status: "reverted" };
}

export async function gitRevertDirectory(
  projectPath: string | null,
  dirPath: string,
): Promise<{ status: string }> {
  logTrace(`Received request gitRevertDirectory path=${dirPath}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const prefix = computePrefix(workTree, projectPath);
  const normalizedDir = normalizeProjectDirPath(dirPath);
  const repoBase = repoBasePathForRevertScope(prefix, normalizedDir);
  const git = makeGit(workTree);
  const s = await git.status();

  const tracked = new Set<string>();
  const consider = (arr: string[] | undefined) => {
    for (const p of arr ?? []) {
      const n = p.replace(/\\/g, "/");
      if (pathUnderRepoBase(n, repoBase)) {
        tracked.add(n);
      }
    }
  };
  consider(s.modified);
  consider(s.created);
  consider(s.deleted);
  consider(s.conflicted);
  for (const row of s.files ?? []) {
    if (row.path) {
      const n = row.path.replace(/\\/g, "/");
      if (pathUnderRepoBase(n, repoBase)) {
        tracked.add(n);
      }
    }
  }

  const untracked = new Set<string>();
  for (const p of s.not_added ?? []) {
    const n = p.replace(/\\/g, "/");
    if (pathUnderRepoBase(n, repoBase)) {
      untracked.add(n);
    }
  }

  if (tracked.size > 0) {
    const paths = [...tracked];
    await git.raw(["reset", "HEAD", "--", ...paths]);
    await git.raw(["checkout", "HEAD", "--", ...paths]);
  }

  const sortedUntracked = [...untracked].sort((a, b) => b.length - a.length);
  for (const fullPath of sortedUntracked) {
    const abs = path.join(workTree, fullPath);
    const norm = path.normalize(abs);
    if (!norm.startsWith(path.normalize(workTree))) {
      continue;
    }
    await deletePathRecursive(norm);
  }

  logTrace(
    `Finished gitRevertDirectory: path=${dirPath} tracked=${tracked.size} untracked=${untracked.size}`,
  );
  return { status: "reverted" };
}

export async function gitDiff(projectPath: string | null): Promise<{ diff: string }> {
  logTrace("Received request gitDiff");
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const git = makeGit(workTree);
  const diff = await git.diff(["HEAD"]);
  logTrace(`Finished gitDiff: ${diff.length} bytes`);
  return { diff };
}

export async function gitLog(
  projectPath: string | null,
  limit: number,
): Promise<GitCommitPayload[]> {
  logTrace(`Received request gitLog limit=${limit}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const git = makeGit(workTree);
  const log = await git.log({ maxCount: limit });
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: GitCommitPayload[] = [];
  for (const c of log.all) {
    const date = c.date
      ? fmt.format(new Date(c.date))
      : "";
    out.push({
      hash: c.hash,
      message: c.message,
      author: c.author_name ?? "",
      date,
    });
  }
  logTrace(`Finished gitLog: ${out.length} entries`);
  return out;
}

export async function gitInit(projectPath: string | null): Promise<{ status: string }> {
  logTrace("Received request gitInit");
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  if (await gitIsRepo(projectPath)) {
    logTrace("Finished gitInit: already initialized");
    return { status: "already initialized" };
  }
  const git = makeGit(projectPath);
  await git.init();
  logTrace("Finished gitInit: initialized");
  return { status: "initialized" };
}

export async function gitAheadBehind(
  projectPath: string | null,
): Promise<{ ahead: number; behind: number }> {
  logTrace("Received request gitAheadBehind");
  if (!projectPath) {
    logTrace("Finished gitAheadBehind: no project → 0/0");
    return { ahead: 0, behind: 0 };
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    logTrace("Finished gitAheadBehind: not a repo → 0/0");
    return { ahead: 0, behind: 0 };
  }
  try {
    const counts = await withOptionalRemoteAuth(workTree, async (git) => {
      await git.fetch();
      const raw = await git.raw([
        "rev-list",
        "--left-right",
        "--count",
        "HEAD...@{upstream}",
      ]);
      const parts = raw.trim().split(/\s+/);
      const left = Number(parts[0] ?? 0);
      const right = Number(parts[1] ?? 0);
      return { ahead: left || 0, behind: right || 0 };
    });
    logTrace(
      `Finished gitAheadBehind: ahead=${counts.ahead}, behind=${counts.behind}`,
    );
    return counts;
  } catch (e) {
    if (e instanceof Error && e.message === "auth_required") {
      throw e;
    }
    logTrace(
      `Finished gitAheadBehind: no upstream or error (${e instanceof Error ? e.message : String(e)}) → 0/0`,
    );
    return { ahead: 0, behind: 0 };
  }
}

export async function gitSync(
  projectPath: string | null,
): Promise<{ action: string; details: string }> {
  logTrace("Received request gitSync");
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  return withOptionalRemoteAuth(workTree, async (git) => {
    await git.fetch();
    let raw: string;
    try {
      raw = await git.raw([
        "rev-list",
        "--left-right",
        "--count",
        "HEAD...@{upstream}",
      ]);
    } catch {
      logTrace("Finished gitSync: no tracking remote configured");
      return {
        action: "no-remote",
        details: "No tracking remote configured",
      };
    }
    const parts = raw.trim().split(/\s+/);
    const ahead = Number(parts[0] ?? 0) || 0;
    const behind = Number(parts[1] ?? 0) || 0;

    if (behind > 0 && ahead > 0) {
      logTrace(`Finished gitSync: diverged ahead=${ahead} behind=${behind}`);
      throw new Error(
        `Branch is diverged (ahead=${ahead}, behind=${behind}). Manual merge required.`,
      );
    }
    if (behind > 0) {
      await git.pull();
      logTrace(`Finished gitSync: pulled ${behind} commit(s)`);
      return { action: "pull", details: `Pulled ${behind} commit(s)` };
    }
    if (ahead > 0) {
      await git.push();
      logTrace(`Finished gitSync: pushed ${ahead} commit(s)`);
      return { action: "push", details: `Pushed ${ahead} commit(s)` };
    }
    logTrace("Finished gitSync: already up to date");
    return { action: "up-to-date", details: "Already up to date" };
  });
}

export async function gitFileHistory(
  projectPath: string | null,
  filePath: string,
): Promise<GitCommitPayload[]> {
  logTrace(`Received request gitFileHistory path=${filePath}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const prefix = computePrefix(workTree, projectPath);
  const fullPath = `${prefix}${filePath.replace(/\\/g, "/")}`;
  const git = makeGit(workTree);
  const log = await git.log({ file: fullPath });
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: GitCommitPayload[] = [];
  for (const c of log.all) {
    const date = c.date
      ? fmt.format(new Date(c.date))
      : "";
    out.push({
      hash: c.hash,
      message: c.message,
      author: c.author_name ?? "",
      date,
    });
  }
  logTrace(`Finished gitFileHistory: ${out.length} commits`);
  return out;
}

export async function gitFileAtCommit(
  projectPath: string | null,
  relPath: string,
  hash: string,
): Promise<{ path: string; hash: string; content: string; exists: boolean }> {
  logTrace(`Received request gitFileAtCommit path=${relPath} hash=${hash}`);
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  const workTree = await findGitWorkTree(projectPath);
  if (!workTree) {
    throw new Error("Not a git repository");
  }
  const prefix = computePrefix(workTree, projectPath);
  const fullPath = `${prefix}${relPath.replace(/\\/g, "/")}`;
  const git = makeGit(workTree);
  const spec = `${hash}:${fullPath}`;
  try {
    const content = await git.show([spec, "--"]);
    logTrace(`Finished gitFileAtCommit: exists=true path=${relPath}`);
    return {
      path: relPath,
      hash,
      content,
      exists: true,
    };
  } catch {
    logTrace(`Finished gitFileAtCommit: exists=false path=${relPath}`);
    return {
      path: relPath,
      hash,
      content: "",
      exists: false,
    };
  }
}
