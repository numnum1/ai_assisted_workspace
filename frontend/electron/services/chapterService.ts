import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ActionNode,
  ChapterComment,
  ChapterFilePaths,
  ChapterNode,
  ChapterSummary,
  CommentCategory,
  NodeMeta,
  SceneNode,
} from "../../src/shared/types.js";
import {
  applyNodeMeta,
  generateId,
  loadManifest,
  reorderById,
  toNodeMeta,
  writeManifest,
  type ManifestAction,
  type ManifestChapter,
  type ManifestScene,
} from "./chapterManifest.js";

const CHAPTERS_DIR = ".project/chapter";

function logTrace(msg: string): void {
  console.log(`[chapterService] ${msg}`);
}

function ensureProjectRoot(projectPath: string | null): string {
  if (!projectPath) {
    throw new Error("No project is currently open.");
  }
  return projectPath;
}

function normalizeWorkspaceRoot(
  workspaceRoot: string | null | undefined,
): string | null {
  if (workspaceRoot == null || workspaceRoot === "" || workspaceRoot === ".") {
    return null;
  }
  return workspaceRoot;
}

function structureBase(
  projectPath: string,
  workspaceRoot: string | null,
): string {
  const wr = normalizeWorkspaceRoot(workspaceRoot);
  if (wr == null) {
    return projectPath;
  }
  return path.join(projectPath, wr);
}

/** The structure root that owns a manifest — project root or a book subproject. */
function manifestBase(
  projectPath: string | null,
  workspaceRoot: string | null,
): string {
  return structureBase(ensureProjectRoot(projectPath), workspaceRoot);
}

function chapterDir(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
): string {
  return path.join(structureBase(projectPath, workspaceRoot), CHAPTERS_DIR, chapterId);
}

function sceneDir(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
): string {
  return path.join(chapterDir(projectPath, workspaceRoot, chapterId), sceneId);
}

function actionContentPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
): string {
  return path.join(
    sceneDir(projectPath, workspaceRoot, chapterId, sceneId),
    `${actionId}.md`,
  );
}

function chapterCommentsPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
): string {
  return path.join(
    structureBase(projectPath, workspaceRoot),
    CHAPTERS_DIR,
    `${chapterId}.comments.json`,
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function deleteIfExists(targetPath: string): Promise<void> {
  try {
    await fs.unlink(targetPath);
  } catch {
    /* ignore */
  }
}

async function deleteRecursively(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

// --- Structure queries --------------------------------------------------------

function sceneToNode(scene: ManifestScene, index: number): SceneNode {
  return {
    id: scene.id,
    meta: toNodeMeta(scene, index),
    actions: scene.actions.map(
      (action, i): ActionNode => ({ id: action.id, meta: toNodeMeta(action, i) }),
    ),
  };
}

export async function listChapters(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<ChapterSummary[]> {
  logTrace(`Received request listChapters root=${workspaceRoot ?? "(default)"}`);
  const manifest = await loadManifest(manifestBase(projectPath, workspaceRoot));
  const chapters = manifest.chapters.map(
    (chapter, index): ChapterSummary => ({
      id: chapter.id,
      meta: toNodeMeta(chapter, index),
    }),
  );
  logTrace(`Finished listChapters: ${chapters.length}`);
  return chapters;
}

export async function getChapterStructure(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<ChapterNode> {
  logTrace(`Received request getChapterStructure id=${chapterId}`);
  const manifest = await loadManifest(manifestBase(projectPath, workspaceRoot));
  const index = manifest.chapters.findIndex((c) => c.id === chapterId);
  if (index < 0) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }
  const chapter = manifest.chapters[index]!;
  const node: ChapterNode = {
    id: chapter.id,
    meta: toNodeMeta(chapter, index),
    scenes: chapter.scenes.map(sceneToNode),
  };
  logTrace(`Finished getChapterStructure: scenes=${node.scenes.length}`);
  return node;
}

/**
 * Relative (git-worktree-friendly) paths for the chapter's own directory and every
 * action `.md` file within it, in scene/action order. Used by the git history view.
 */
export async function getChapterFilePaths(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<ChapterFilePaths> {
  const root = ensureProjectRoot(projectPath);
  const chapter = await getChapterStructure(root, chapterId, workspaceRoot);
  const cDir = chapterDir(root, workspaceRoot, chapterId);
  const toRelPath = (absPath: string) =>
    path.relative(root, absPath).split(path.sep).join("/");

  const actions: ChapterFilePaths["actions"] = [];
  for (const scene of chapter.scenes) {
    for (const action of scene.actions) {
      const absPath = actionContentPath(
        root,
        workspaceRoot,
        chapterId,
        scene.id,
        action.id,
      );
      actions.push({
        sceneId: scene.id,
        actionId: action.id,
        relPath: toRelPath(absPath),
      });
    }
  }

  return {
    chapterDirRelPath: toRelPath(cDir),
    actions,
  };
}

// --- Chapter mutations --------------------------------------------------------

export async function createChapter(
  projectPath: string | null,
  title: string,
  workspaceRoot: string | null,
): Promise<ChapterSummary> {
  logTrace(`Received request createChapter title=${title.slice(0, 60)}`);
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter: ManifestChapter = {
    id: generateId(),
    title,
    description: "",
    scenes: [],
  };
  manifest.chapters.push(chapter);
  await writeManifest(base, manifest);
  await fs.mkdir(chapterDir(root, workspaceRoot, chapter.id), { recursive: true });
  logTrace(`Finished createChapter: id=${chapter.id}`);
  return { id: chapter.id, meta: toNodeMeta(chapter, manifest.chapters.length - 1) };
}

export async function updateChapterMeta(
  projectPath: string | null,
  chapterId: string,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request updateChapterMeta id=${chapterId}`);
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }
  applyNodeMeta(chapter, meta);
  await writeManifest(base, manifest);
  logTrace("Finished updateChapterMeta");
}

export async function deleteChapter(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request deleteChapter id=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  manifest.chapters = manifest.chapters.filter((c) => c.id !== chapterId);
  await writeManifest(base, manifest);
  const cdir = chapterDir(root, workspaceRoot, chapterId);
  if (await pathExists(cdir)) {
    await deleteRecursively(cdir);
  }
  await deleteIfExists(chapterCommentsPath(root, workspaceRoot, chapterId));
  logTrace("Finished deleteChapter");
}

// --- Scene mutations ----------------------------------------------------------

export async function createScene(
  projectPath: string | null,
  chapterId: string,
  title: string,
  workspaceRoot: string | null,
): Promise<SceneNode> {
  logTrace(`Received request createScene chapter=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }
  const defaultAction: ManifestAction = {
    id: generateId(),
    title: "Inhalt",
    description: "",
  };
  const scene: ManifestScene = {
    id: generateId(),
    title,
    description: "",
    actions: [defaultAction],
  };
  chapter.scenes.push(scene);
  await writeManifest(base, manifest);

  // Materialize the scene's content dir and the default action's (empty) prose file.
  await fs.mkdir(sceneDir(root, workspaceRoot, chapterId, scene.id), {
    recursive: true,
  });
  await fs.writeFile(
    actionContentPath(root, workspaceRoot, chapterId, scene.id, defaultAction.id),
    "",
    "utf8",
  );
  logTrace(`Finished createScene: id=${scene.id}`);
  return sceneToNode(scene, chapter.scenes.length - 1);
}

export async function updateSceneMeta(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request updateSceneMeta chapter=${chapterId} scene=${sceneId}`);
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  applyNodeMeta(scene, meta);
  await writeManifest(base, manifest);
  logTrace("Finished updateSceneMeta");
}

export async function deleteScene(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request deleteScene chapter=${chapterId} scene=${sceneId}`);
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  if (chapter) {
    chapter.scenes = chapter.scenes.filter((s) => s.id !== sceneId);
    await writeManifest(base, manifest);
  }
  await deleteRecursively(sceneDir(root, workspaceRoot, chapterId, sceneId));
  logTrace("Finished deleteScene");
}

// --- Action mutations ---------------------------------------------------------

export async function createAction(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  title: string,
  workspaceRoot: string | null,
): Promise<ActionNode> {
  logTrace(`Received request createAction chapter=${chapterId} scene=${sceneId}`);
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  const action: ManifestAction = { id: generateId(), title, description: "" };
  scene.actions.push(action);
  await writeManifest(base, manifest);

  await fs.mkdir(sceneDir(root, workspaceRoot, chapterId, sceneId), {
    recursive: true,
  });
  await fs.writeFile(
    actionContentPath(root, workspaceRoot, chapterId, sceneId, action.id),
    "",
    "utf8",
  );
  logTrace(`Finished createAction: id=${action.id}`);
  return { id: action.id, meta: toNodeMeta(action, scene.actions.length - 1) };
}

export async function updateActionMeta(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(
    `Received request updateActionMeta chapter=${chapterId} scene=${sceneId} action=${actionId}`,
  );
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  const action = scene?.actions.find((a) => a.id === actionId);
  if (!action) {
    throw new Error(`Action not found: ${actionId}`);
  }
  applyNodeMeta(action, meta);
  await writeManifest(base, manifest);
  logTrace("Finished updateActionMeta");
}

export async function deleteAction(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(
    `Received request deleteAction chapter=${chapterId} scene=${sceneId} action=${actionId}`,
  );
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (scene) {
    scene.actions = scene.actions.filter((a) => a.id !== actionId);
    await writeManifest(base, manifest);
  }
  await deleteIfExists(
    actionContentPath(root, workspaceRoot, chapterId, sceneId, actionId),
  );
  logTrace("Finished deleteAction");
}

// --- Prose content (unchanged: lives in .md on disk) --------------------------

export async function readActionContent(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  workspaceRoot: string | null,
): Promise<string> {
  const root = ensureProjectRoot(projectPath);
  const p = actionContentPath(root, workspaceRoot, chapterId, sceneId, actionId);
  if (!(await pathExists(p))) {
    return "";
  }
  return fs.readFile(p, "utf8");
}

export async function writeActionContent(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  content: string,
  workspaceRoot: string | null,
): Promise<void> {
  const root = ensureProjectRoot(projectPath);
  const p = actionContentPath(root, workspaceRoot, chapterId, sceneId, actionId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

// --- Ordering (array position is the single source of truth) ------------------

export async function reorderChapters(
  projectPath: string | null,
  orderedIds: string[],
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request reorderChapters n=${orderedIds.length}`);
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  manifest.chapters = reorderById(manifest.chapters, orderedIds);
  await writeManifest(base, manifest);
  logTrace("Finished reorderChapters");
}

export async function reorderScenes(
  projectPath: string | null,
  chapterId: string,
  orderedIds: string[],
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request reorderScenes chapter=${chapterId} n=${orderedIds.length}`);
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  if (chapter) {
    chapter.scenes = reorderById(chapter.scenes, orderedIds);
    await writeManifest(base, manifest);
  }
  logTrace("Finished reorderScenes");
}

export async function reorderActions(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  orderedIds: string[],
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(
    `Received request reorderActions chapter=${chapterId} scene=${sceneId} n=${orderedIds.length}`,
  );
  const base = manifestBase(projectPath, workspaceRoot);
  const manifest = await loadManifest(base);
  const chapter = manifest.chapters.find((c) => c.id === chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (scene) {
    scene.actions = reorderById(scene.actions, orderedIds);
    await writeManifest(base, manifest);
  }
  logTrace("Finished reorderActions");
}

// --- Book-level meta (own file: .project/book.json, unchanged by the manifest) ---

function bookMetaPath(
  projectPath: string,
  workspaceRoot: string | null,
): string {
  return path.join(structureBase(projectPath, workspaceRoot), ".project", "book.json");
}

function normalizeBookMeta(raw: unknown): NodeMeta {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extrasRaw =
    o.extras && typeof o.extras === "object" && !Array.isArray(o.extras)
      ? (o.extras as Record<string, unknown>)
      : {};
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(extrasRaw)) {
    if (typeof v === "string") extras[k] = v;
  }
  return {
    title: typeof o.title === "string" ? o.title : "",
    description: typeof o.description === "string" ? o.description : "",
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
  };
}

export async function getBookMeta(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<NodeMeta> {
  logTrace("Received request getBookMeta");
  const root = ensureProjectRoot(projectPath);
  const p = bookMetaPath(root, workspaceRoot);
  if (!(await pathExists(p))) {
    return { title: "", description: "", sortOrder: 0 };
  }
  try {
    return normalizeBookMeta(JSON.parse(await fs.readFile(p, "utf8")) as unknown);
  } catch {
    return { title: "", description: "", sortOrder: 0 };
  }
}

export async function updateBookMeta(
  projectPath: string | null,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace("Received request updateBookMeta");
  const root = ensureProjectRoot(projectPath);
  const p = bookMetaPath(root, workspaceRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  logTrace("Finished updateBookMeta");
}

// --- Comments (separate .comments.json sidecar, unchanged) --------------------

function normalizeComment(raw: unknown): ChapterComment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const quote = typeof o.quote === "string" ? o.quote : "";
  const comment = typeof o.comment === "string" ? o.comment : "";
  if (!comment.trim()) return null;
  const category: CommentCategory =
    typeof o.category === "string" && o.category.trim()
      ? o.category
      : "sonstiges";
  const id = typeof o.id === "string" && o.id.trim() ? o.id : randomUUID();
  const suggestion =
    typeof o.suggestion === "string" && o.suggestion.trim()
      ? o.suggestion
      : undefined;
  const accepted = o.accepted === true;
  return {
    id,
    quote,
    comment,
    category,
    ...(suggestion !== undefined ? { suggestion } : {}),
    ...(accepted ? { accepted } : {}),
  };
}

function normalizeComments(raw: unknown): ChapterComment[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { comments?: unknown }).comments)
      ? (raw as { comments: unknown[] }).comments
      : [];
  const out: ChapterComment[] = [];
  for (const entry of list) {
    const normalized = normalizeComment(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function readChapterComments(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<ChapterComment[]> {
  logTrace(`Received request readChapterComments id=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  const commentsPath = chapterCommentsPath(root, workspaceRoot, chapterId);
  if (!(await pathExists(commentsPath))) {
    return [];
  }
  try {
    const json = await fs.readFile(commentsPath, "utf8");
    return normalizeComments(JSON.parse(json) as unknown);
  } catch (err) {
    logTrace(`readChapterComments parse error: ${String(err)}`);
    return [];
  }
}

export async function writeChapterComments(
  projectPath: string | null,
  chapterId: string,
  comments: ChapterComment[],
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(
    `Received request writeChapterComments id=${chapterId} count=${comments.length}`,
  );
  const root = ensureProjectRoot(projectPath);
  const commentsPath = chapterCommentsPath(root, workspaceRoot, chapterId);
  const normalized = normalizeComments(comments);
  const payload = { version: 1, comments: normalized };
  await fs.mkdir(path.dirname(commentsPath), { recursive: true });
  await fs.writeFile(commentsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  logTrace("Finished writeChapterComments");
}

// --- Maintenance --------------------------------------------------------------

/**
 * Regenerate every chapter/scene/action id as a fresh UUID and move the prose
 * `.md` files to their new id-based paths. Scrubs predictable legacy ids
 * (`chapter_1`, …). The manifest is the source of truth; content is preserved.
 */
export async function randomizeIds(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<{ renamed: number }> {
  logTrace("Received request randomizeIds");
  const root = ensureProjectRoot(projectPath);
  const base = manifestBase(root, workspaceRoot);
  const manifest = await loadManifest(base);
  if (manifest.chapters.length === 0) {
    logTrace("Finished randomizeIds: 0");
    return { renamed: 0 };
  }

  let count = 0;
  const oldChapterDirs: string[] = [];

  for (const chapter of manifest.chapters) {
    const oldChapterId = chapter.id;
    const newChapterId = generateId();
    oldChapterDirs.push(chapterDir(root, workspaceRoot, oldChapterId));

    for (const scene of chapter.scenes) {
      const oldSceneId = scene.id;
      const newSceneId = generateId();

      for (const action of scene.actions) {
        const oldActionId = action.id;
        const newActionId = generateId();

        const oldMd = actionContentPath(
          root,
          workspaceRoot,
          oldChapterId,
          oldSceneId,
          oldActionId,
        );
        let content = "";
        try {
          content = await fs.readFile(oldMd, "utf8");
        } catch {
          /* no prose yet */
        }
        const newMd = actionContentPath(
          root,
          workspaceRoot,
          newChapterId,
          newSceneId,
          newActionId,
        );
        await fs.mkdir(path.dirname(newMd), { recursive: true });
        await fs.writeFile(newMd, content, "utf8");

        action.id = newActionId;
        count++;
      }

      scene.id = newSceneId;
      count++;
    }

    chapter.id = newChapterId;
    count++;
  }

  await writeManifest(base, manifest);
  for (const dir of oldChapterDirs) {
    await deleteRecursively(dir);
  }

  logTrace(`Finished randomizeIds: renamed=${count}`);
  return { renamed: count };
}
