import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ActionNode,
  ChapterNode,
  ChapterSummary,
  NodeMeta,
  SceneNode,
} from "../../src/types.js";

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

async function structureBase(
  projectPath: string,
  workspaceRoot: string | null,
): Promise<string> {
  const wr = normalizeWorkspaceRoot(workspaceRoot);
  if (wr == null) {
    return projectPath;
  }
  return path.join(projectPath, wr);
}

async function chaptersRoot(
  projectPath: string,
  workspaceRoot: string | null,
): Promise<string> {
  return path.join(await structureBase(projectPath, workspaceRoot), CHAPTERS_DIR);
}

async function chapterDir(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
): Promise<string> {
  return path.join(await chaptersRoot(projectPath, workspaceRoot), chapterId);
}

async function chapterMetaPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
): Promise<string> {
  return path.join(
    await chaptersRoot(projectPath, workspaceRoot),
    `${chapterId}.json`,
  );
}

async function sceneDir(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
): Promise<string> {
  return path.join(
    await chapterDir(projectPath, workspaceRoot, chapterId),
    sceneId,
  );
}

async function sceneMetaPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
): Promise<string> {
  return path.join(
    await chapterDir(projectPath, workspaceRoot, chapterId),
    `${sceneId}.json`,
  );
}

async function actionMetaPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
): Promise<string> {
  return path.join(
    await sceneDir(projectPath, workspaceRoot, chapterId, sceneId),
    `${actionId}.json`,
  );
}

async function actionContentPath(
  projectPath: string,
  workspaceRoot: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
): Promise<string> {
  return path.join(
    await sceneDir(projectPath, workspaceRoot, chapterId, sceneId),
    `${actionId}.md`,
  );
}

async function bookMetaPath(
  projectPath: string,
  workspaceRoot: string | null,
): Promise<string> {
  return path.join(
    await structureBase(projectPath, workspaceRoot),
    ".project",
    "book.json",
  );
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

function normalizeNodeMeta(raw: unknown): NodeMeta {
  if (!raw || typeof raw !== "object") {
    return { title: "", description: "", sortOrder: 0 };
  }
  const o = raw as Record<string, unknown>;
  const extras =
    typeof o.extras === "object" &&
    o.extras !== null &&
    !Array.isArray(o.extras)
      ? (o.extras as Record<string, string>)
      : undefined;
  return {
    title: typeof o.title === "string" ? o.title : "",
    description: typeof o.description === "string" ? o.description : "",
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
    ...(extras ? { extras } : {}),
  };
}

async function readMetaFile(metaPath: string): Promise<NodeMeta> {
  const json = await fs.readFile(metaPath, "utf8");
  return normalizeNodeMeta(JSON.parse(json) as unknown);
}

async function writeMetaFile(metaPath: string, meta: NodeMeta): Promise<void> {
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function endDigitRun(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\d/.test(s[j]!)) {
    j++;
  }
  return j;
}

function endNonDigitRun(s: string, i: number): number {
  let j = i;
  while (j < s.length && !/\d/.test(s[j]!)) {
    j++;
  }
  return j;
}

const collator = new Intl.Collator("de", { sensitivity: "base" });

function compareNaturalStrings(a: string, b: string): number {
  let ia = 0;
  let ib = 0;
  const sa = a ?? "";
  const sb = b ?? "";
  while (ia < sa.length && ib < sb.length) {
    const ca = sa[ia]!;
    const cb = sb[ib]!;
    const da = /\d/.test(ca);
    const db = /\d/.test(cb);
    if (da && db) {
      const na = endDigitRun(sa, ia);
      const nb = endDigitRun(sb, ib);
      const va = Number.parseInt(sa.slice(ia, na), 10);
      const vb = Number.parseInt(sb.slice(ib, nb), 10);
      if (va !== vb) {
        return va - vb;
      }
      ia = na;
      ib = nb;
    } else if (!da && !db) {
      const na = endNonDigitRun(sa, ia);
      const nb = endNonDigitRun(sb, ib);
      const cmp = collator.compare(sa.slice(ia, na), sb.slice(ib, nb));
      if (cmp !== 0) {
        return cmp;
      }
      ia = na;
      ib = nb;
    } else {
      return Number(db) - Number(da);
    }
  }
  return sa.length - sb.length;
}

function chapterSortKey(c: ChapterSummary): string {
  const t = c.meta?.title?.trim();
  if (t) {
    return t;
  }
  return c.id ?? "";
}

async function nextSortOrder(dir: string, extension: string): Promise<number> {
  if (!(await pathExists(dir))) {
    return 0;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(
    (e) => e.isFile() && e.name.endsWith(extension),
  ).length;
}

function generateId(): string {
  return randomUUID();
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

export async function listChapters(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<ChapterSummary[]> {
  logTrace(`Received request listChapters root=${workspaceRoot ?? "(default)"}`);
  const root = ensureProjectRoot(projectPath);
  const cr = await chaptersRoot(root, workspaceRoot);
  if (!(await pathExists(cr))) {
    logTrace("Finished listChapters: 0 (no chapter dir)");
    return [];
  }
  const entries = await fs.readdir(cr, { withFileTypes: true });
  const chapters: ChapterSummary[] = [];
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith(".json")) {
      continue;
    }
    const id = stripExtension(ent.name);
    const metaPath = path.join(cr, ent.name);
    try {
      const meta = await readMetaFile(metaPath);
      chapters.push({ id, meta });
    } catch {
      chapters.push({
        id,
        meta: { title: "", description: "", sortOrder: 0 },
      });
    }
  }
  chapters.sort((c1, c2) => {
    const byKey = compareNaturalStrings(
      chapterSortKey(c1),
      chapterSortKey(c2),
    );
    if (byKey !== 0) {
      return byKey;
    }
    return compareNaturalStrings(c1.id ?? "", c2.id ?? "");
  });
  logTrace(`Finished listChapters: ${chapters.length}`);
  return chapters;
}

export async function getChapterStructure(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<ChapterNode> {
  logTrace(`Received request getChapterStructure id=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  const metaPath = await chapterMetaPath(root, workspaceRoot, chapterId);
  if (!(await pathExists(metaPath))) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }
  const chapterMeta = await readMetaFile(metaPath);
  const chapter: ChapterNode = {
    id: chapterId,
    meta: chapterMeta,
    scenes: [],
  };
  const cDir = await chapterDir(root, workspaceRoot, chapterId);
  if (await pathExists(cDir)) {
    const entries = await fs.readdir(cDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) {
        continue;
      }
      const sceneId = stripExtension(ent.name);
      const smPath = path.join(cDir, ent.name);
      let sceneMeta: NodeMeta;
      try {
        sceneMeta = await readMetaFile(smPath);
      } catch {
        sceneMeta = { title: "", description: "", sortOrder: 0 };
      }
      const scene: SceneNode = { id: sceneId, meta: sceneMeta, actions: [] };
      const sDir = path.join(cDir, sceneId);
      if (await pathExists(sDir)) {
        const aEntries = await fs.readdir(sDir, { withFileTypes: true });
        for (const ap of aEntries) {
          if (!ap.isFile() || !ap.name.endsWith(".json")) {
            continue;
          }
          const actionId = stripExtension(ap.name);
          const amPath = path.join(sDir, ap.name);
          try {
            const aMeta = await readMetaFile(amPath);
            scene.actions.push({ id: actionId, meta: aMeta });
          } catch {
            scene.actions.push({
              id: actionId,
              meta: { title: "", description: "", sortOrder: 0 },
            });
          }
        }
      }
      scene.actions.sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);
      chapter.scenes.push(scene);
    }
  }
  chapter.scenes.sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);
  logTrace(`Finished getChapterStructure: scenes=${chapter.scenes.length}`);
  return chapter;
}

export async function createChapter(
  projectPath: string | null,
  title: string,
  workspaceRoot: string | null,
): Promise<ChapterSummary> {
  logTrace(`Received request createChapter title=${title.slice(0, 60)}`);
  const root = ensureProjectRoot(projectPath);
  const cr = await chaptersRoot(root, workspaceRoot);
  await fs.mkdir(cr, { recursive: true });
  const nextOrder = await nextSortOrder(cr, ".json");
  const id = generateId();
  const meta: NodeMeta = { title, description: "", sortOrder: nextOrder };
  await writeMetaFile(await chapterMetaPath(root, workspaceRoot, id), meta);
  await fs.mkdir(await chapterDir(root, workspaceRoot, id), { recursive: true });
  logTrace(`Finished createChapter: id=${id}`);
  return { id, meta };
}

export async function updateChapterMeta(
  projectPath: string | null,
  chapterId: string,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request updateChapterMeta id=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  await writeMetaFile(
    await chapterMetaPath(root, workspaceRoot, chapterId),
    meta,
  );
  logTrace("Finished updateChapterMeta");
}

export async function deleteChapter(
  projectPath: string | null,
  chapterId: string,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request deleteChapter id=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  await deleteIfExists(await chapterMetaPath(root, workspaceRoot, chapterId));
  const cdir = await chapterDir(root, workspaceRoot, chapterId);
  if (await pathExists(cdir)) {
    await deleteRecursively(cdir);
  }
  logTrace("Finished deleteChapter");
}

export async function createScene(
  projectPath: string | null,
  chapterId: string,
  title: string,
  workspaceRoot: string | null,
): Promise<SceneNode> {
  logTrace(`Received request createScene chapter=${chapterId}`);
  const root = ensureProjectRoot(projectPath);
  const cDir = await chapterDir(root, workspaceRoot, chapterId);
  await fs.mkdir(cDir, { recursive: true });
  const nextOrder = await nextSortOrder(cDir, ".json");
  const id = generateId();
  const meta: NodeMeta = { title, description: "", sortOrder: nextOrder };
  await writeMetaFile(
    await sceneMetaPath(root, workspaceRoot, chapterId, id),
    meta,
  );
  await fs.mkdir(await sceneDir(root, workspaceRoot, chapterId, id), {
    recursive: true,
  });
  const scene: SceneNode = { id, meta, actions: [] };
  const defaultAction = await createAction(
    projectPath,
    chapterId,
    id,
    "Inhalt",
    workspaceRoot,
  );
  scene.actions.push(defaultAction);
  logTrace(`Finished createScene: id=${id}`);
  return scene;
}

export async function updateSceneMeta(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request updateSceneMeta chapter=${chapterId} scene=${sceneId}`);
  const root = ensureProjectRoot(projectPath);
  await writeMetaFile(
    await sceneMetaPath(root, workspaceRoot, chapterId, sceneId),
    meta,
  );
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
  await deleteIfExists(
    await sceneMetaPath(root, workspaceRoot, chapterId, sceneId),
  );
  await deleteRecursively(
    await sceneDir(root, workspaceRoot, chapterId, sceneId),
  );
  logTrace("Finished deleteScene");
}

export async function createAction(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  title: string,
  workspaceRoot: string | null,
): Promise<ActionNode> {
  logTrace(
    `Received request createAction chapter=${chapterId} scene=${sceneId}`,
  );
  const root = ensureProjectRoot(projectPath);
  const sDir = await sceneDir(root, workspaceRoot, chapterId, sceneId);
  await fs.mkdir(sDir, { recursive: true });
  const nextOrder = await nextSortOrder(sDir, ".json");
  const id = generateId();
  const meta: NodeMeta = { title, description: "", sortOrder: nextOrder };
  await writeMetaFile(
    await actionMetaPath(root, workspaceRoot, chapterId, sceneId, id),
    meta,
  );
  const mdPath = await actionContentPath(
    root,
    workspaceRoot,
    chapterId,
    sceneId,
    id,
  );
  await fs.writeFile(mdPath, "", "utf8");
  logTrace(`Finished createAction: id=${id}`);
  return { id, meta };
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
  const root = ensureProjectRoot(projectPath);
  await writeMetaFile(
    await actionMetaPath(root, workspaceRoot, chapterId, sceneId, actionId),
    meta,
  );
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
  await deleteIfExists(
    await actionMetaPath(root, workspaceRoot, chapterId, sceneId, actionId),
  );
  await deleteIfExists(
    await actionContentPath(root, workspaceRoot, chapterId, sceneId, actionId),
  );
  logTrace("Finished deleteAction");
}

export async function readActionContent(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  workspaceRoot: string | null,
): Promise<string> {
  logTrace(
    `Received request readActionContent chapter=${chapterId} scene=${sceneId} action=${actionId}`,
  );
  const root = ensureProjectRoot(projectPath);
  const p = await actionContentPath(
    root,
    workspaceRoot,
    chapterId,
    sceneId,
    actionId,
  );
  if (!(await pathExists(p))) {
    logTrace("Finished readActionContent: empty");
    return "";
  }
  const content = await fs.readFile(p, "utf8");
  logTrace(`Finished readActionContent: ${content.length} chars`);
  return content;
}

export async function writeActionContent(
  projectPath: string | null,
  chapterId: string,
  sceneId: string,
  actionId: string,
  content: string,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(
    `Received request writeActionContent chapter=${chapterId} scene=${sceneId} action=${actionId}`,
  );
  const root = ensureProjectRoot(projectPath);
  const p = await actionContentPath(
    root,
    workspaceRoot,
    chapterId,
    sceneId,
    actionId,
  );
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
  logTrace("Finished writeActionContent");
}

export async function reorderScenes(
  projectPath: string | null,
  chapterId: string,
  orderedIds: string[],
  workspaceRoot: string | null,
): Promise<void> {
  logTrace(`Received request reorderScenes chapter=${chapterId} n=${orderedIds.length}`);
  const root = ensureProjectRoot(projectPath);
  for (let i = 0; i < orderedIds.length; i++) {
    const sceneId = orderedIds[i]!;
    const metaPath = await sceneMetaPath(
      root,
      workspaceRoot,
      chapterId,
      sceneId,
    );
    if (await pathExists(metaPath)) {
      const meta = await readMetaFile(metaPath);
      meta.sortOrder = i;
      await writeMetaFile(metaPath, meta);
    }
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
  const root = ensureProjectRoot(projectPath);
  for (let i = 0; i < orderedIds.length; i++) {
    const actionId = orderedIds[i]!;
    const metaPath = await actionMetaPath(
      root,
      workspaceRoot,
      chapterId,
      sceneId,
      actionId,
    );
    if (await pathExists(metaPath)) {
      const meta = await readMetaFile(metaPath);
      meta.sortOrder = i;
      await writeMetaFile(metaPath, meta);
    }
  }
  logTrace("Finished reorderActions");
}

export async function getBookMeta(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<NodeMeta> {
  logTrace("Received request getBookMeta");
  const root = ensureProjectRoot(projectPath);
  const p = await bookMetaPath(root, workspaceRoot);
  if (!(await pathExists(p))) {
    logTrace("Finished getBookMeta: default empty meta");
    return { title: "", description: "", sortOrder: 0 };
  }
  const meta = await readMetaFile(p);
  logTrace("Finished getBookMeta");
  return meta;
}

export async function updateBookMeta(
  projectPath: string | null,
  meta: NodeMeta,
  workspaceRoot: string | null,
): Promise<void> {
  logTrace("Received request updateBookMeta");
  const root = ensureProjectRoot(projectPath);
  await writeMetaFile(await bookMetaPath(root, workspaceRoot), meta);
  logTrace("Finished updateBookMeta");
}

export async function randomizeIds(
  projectPath: string | null,
  workspaceRoot: string | null,
): Promise<{ renamed: number }> {
  logTrace("Received request randomizeIds");
  const root = ensureProjectRoot(projectPath);
  const cr = await chaptersRoot(root, workspaceRoot);
  if (!(await pathExists(cr))) {
    logTrace("Finished randomizeIds: 0");
    return { renamed: 0 };
  }
  let count = 0;
  const entries = await fs.readdir(cr, { withFileTypes: true });
  const chapterJsons = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith(".json") &&
        /^chapter_\d+\.json$/.test(e.name),
    )
    .map((e) => path.join(cr, e.name));

  for (const cJson of chapterJsons) {
    const oldCid = stripExtension(path.basename(cJson));
    const newCid = generateId();
    const oldCdir = path.join(cr, oldCid);
    const newCdir = path.join(cr, newCid);
    if (path.isAbsolute(oldCdir) && (await pathExists(oldCdir))) {
      const sEntries = await fs.readdir(oldCdir, { withFileTypes: true });
      const sceneJsons = sEntries
        .filter(
          (e) =>
            e.isFile() &&
            e.name.endsWith(".json") &&
            /^scene_\d+\.json$/.test(e.name),
        )
        .map((e) => path.join(oldCdir, e.name));
      for (const sJson of sceneJsons) {
        const oldSid = stripExtension(path.basename(sJson));
        const newSid = generateId();
        const oldSdir = path.join(oldCdir, oldSid);
        const newSdir = path.join(oldCdir, newSid);
        if (await pathExists(oldSdir)) {
          const aEntries = await fs.readdir(oldSdir, { withFileTypes: true });
          const actionJsons = aEntries
            .filter(
              (e) =>
                e.isFile() &&
                e.name.endsWith(".json") &&
                /^action_\d+\.json$/.test(e.name),
            )
            .map((e) => path.join(oldSdir, e.name));
          for (const aJson of actionJsons) {
            const oldAid = stripExtension(path.basename(aJson));
            const newAid = generateId();
            await fs.rename(aJson, path.join(oldSdir, `${newAid}.json`));
            const aMd = path.join(oldSdir, `${oldAid}.md`);
            if (await pathExists(aMd)) {
              await fs.rename(aMd, path.join(oldSdir, `${newAid}.md`));
            }
            count++;
          }
          await fs.rename(oldSdir, newSdir);
        }
        await fs.rename(sJson, path.join(oldCdir, `${newSid}.json`));
        count++;
      }
      await fs.rename(oldCdir, newCdir);
    }
    await fs.rename(cJson, path.join(cr, `${newCid}.json`));
    count++;
  }
  logTrace(`Finished randomizeIds: renamed=${count}`);
  return { renamed: count };
}
