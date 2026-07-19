import "./installConsoleTimestamps.js";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, screen, Tray } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChapterComment, NodeMeta } from "../src/shared/types.js";
import {
  browseForProject,
  getCurrentProject,
  getCurrentProjectPath,
  openProject,
  restoreLastProject,
  revealProject,
} from "./services/projectService.js";
import {
  copyPath,
  createFile,
  createFolder,
  deleteContent,
  getContent,
  getTree,
  movePath,
  renamePath,
  saveContent,
} from "./services/filesService.js";
import {
  deleteProjectMode as removeProjectMode,
  deleteProjectCommentCategory as removeCommentCategory,
  getProjectConfig,
  getProjectConfigStatus,
  getProjectCommentCategories as listCommentCategories,
  getWorkspaceMode,
  getWorkspaceModesDataDir,
  initProjectConfig,
  initProjectConfigFromFile,
  getProjectModes as listProjectModes,
  listWorkspaceModes,
  revealWorkspaceModesDataDir,
  updateProjectConfig as saveProjectConfig,
  saveProjectMode,
  saveProjectCommentCategory,
  resetProjectModes,
  resetProjectCommentCategories,
} from "./services/projectConfigService.js";
import {
  getSubprojectInfo,
  initSubproject,
  removeSubproject,
} from "./services/subprojectService.js";
import {
  listWikiFiles,
  listWikiFolders,
  createWikiFolder,
  createWikiFile,
  searchWiki,
  getAttachedNote,
  createAttachedNote,
} from "./services/wikiService.js";
import { readArcs, writeArcs, computeArcCoverage } from "./services/arcService.js";
import {
  readStoryboard,
  writeStoryboard,
} from "./services/storyboardService.js";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "./services/eventsService.js";
import type { ArcData } from "../src/shared/types.js";
import type { StoryboardData } from "../src/shared/types.js";
import type { EventStatus } from "../src/shared/types.js";
import {
  previewChatContext,
  startChatStream,
  stopChatStream,
  generateThreadSummary,
  generateChapterComments,
  type ChapterCommentCategoryInput,
} from "./services/chatService.js";
import {
  createProvider,
  deleteProvider,
  listPublicProviders,
  updateProvider,
} from "./services/aiProviderService.js";
import {
  applySnapshot,
  getSnapshot,
  revertSnapshot,
} from "./services/snapshotService.js";
import {
  fillTypedFile,
  getTypedFileContent,
  saveTypedFileContent,
  listTypedFiles,
} from "./services/typedFilesService.js";
import {
  runEnsembleScene,
  type EnsembleRunRequest,
} from "./services/ensembleService.js";
import { searchProjectContent } from "./services/searchService.js";
import { indexProject, getIndexStatus } from "./services/vectorService.js";
import { listProviders, resolveEmbeddingCredentials } from "./services/aiProviderService.js";
import {
  gitAheadBehind,
  gitCommit,
  gitDiff,
  gitFileAtCommit,
  gitFileHistory,
  gitInit,
  gitLog,
  gitRevertDirectory,
  gitRevertFile,
  gitStatus,
  gitSync,
  setGitCredentials,
} from "./services/gitService.js";
import * as chapterService from "./services/chapterService.js";
import {
  getPreferences,
  patchPreferences,
} from "./services/preferencesService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function registerIpcHandlers(): void {
  ipcMain.handle("project:current", () => getCurrentProject());
  ipcMain.handle("project:reveal", () => revealProject());
  ipcMain.handle("project:browse", () => browseForProject());
  ipcMain.handle("project:open", async (_event, projectPath: string) => {
    const result = await openProject(projectPath);
    broadcast("workspace:changed", { reason: "project" });
    return result;
  });

  ipcMain.handle("files:getTree", () => getTree(getCurrentProjectPath()));
  ipcMain.handle("files:getContent", (_event, filePath: string) =>
    getContent(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle(
    "files:saveContent",
    (_event, filePath: string, content: string) =>
      saveContent(getCurrentProjectPath(), filePath, content),
  );
  ipcMain.handle("files:deleteContent", (_event, filePath: string) =>
    deleteContent(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle(
    "files:createFile",
    (_event, parentPath: string, name: string) =>
      createFile(getCurrentProjectPath(), parentPath, name),
  );
  ipcMain.handle(
    "files:createFolder",
    (_event, parentPath: string, name: string) =>
      createFolder(getCurrentProjectPath(), parentPath, name),
  );
  ipcMain.handle("files:rename", (_event, filePath: string, newName: string) =>
    renamePath(getCurrentProjectPath(), filePath, newName),
  );
  ipcMain.handle("files:copy", (_event, filePath: string) =>
    copyPath(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle(
    "files:move",
    (_event, filePath: string, targetParentPath: string) =>
      movePath(getCurrentProjectPath(), filePath, targetParentPath),
  );

  ipcMain.handle("subproject:info", (_event, targetPath: string) =>
    getSubprojectInfo(getCurrentProjectPath(), targetPath),
  );
  ipcMain.handle(
    "subproject:init",
    (_event, targetPath: string, type: string, name: string) =>
      initSubproject(getCurrentProjectPath(), targetPath, type, name),
  );
  ipcMain.handle("subproject:remove", (_event, targetPath: string) =>
    removeSubproject(getCurrentProjectPath(), targetPath),
  );

  ipcMain.handle("wiki:listFiles", () =>
    listWikiFiles(getCurrentProjectPath()),
  );
  ipcMain.handle("wiki:listFolders", () =>
    listWikiFolders(getCurrentProjectPath()),
  );
  ipcMain.handle("wiki:createFolder", (_event, parentPath: string, name: string) =>
    createWikiFolder(getCurrentProjectPath(), parentPath, name),
  );
  ipcMain.handle("wiki:createFile", (_event, parentPath: string, name: string) =>
    createWikiFile(getCurrentProjectPath(), parentPath, name),
  );
  ipcMain.handle("wiki:search", (_event, query: string, limit?: number) =>
    searchWiki(getCurrentProjectPath(), query, limit),
  );
  ipcMain.handle("wiki:getAttachedNote", (_event, ownerRef: string) =>
    getAttachedNote(getCurrentProjectPath(), ownerRef),
  );
  ipcMain.handle("wiki:createAttachedNote", (_event, ownerRef: string, title: string) =>
    createAttachedNote(getCurrentProjectPath(), ownerRef, title),
  );

  ipcMain.handle("arcs:read", () => readArcs(getCurrentProjectPath()));
  ipcMain.handle("arcs:write", (_event, data: ArcData) =>
    writeArcs(getCurrentProjectPath(), data),
  );
  ipcMain.handle("arcs:coverage", () => computeArcCoverage(getCurrentProjectPath()));

  ipcMain.handle("storyboard:read", () =>
    readStoryboard(getCurrentProjectPath()),
  );
  ipcMain.handle("storyboard:write", (_event, data: StoryboardData) =>
    writeStoryboard(getCurrentProjectPath(), data),
  );
  ipcMain.handle("storyboard:openWindow", () => {
    openWindow("storyboard");
    return { status: "ok" };
  });

  ipcMain.handle("events:list", () => listEvents(getCurrentProjectPath()));
  ipcMain.handle(
    "events:create",
    (_event, title: string, summary: string) =>
      createEvent(getCurrentProjectPath(), title, summary),
  );
  ipcMain.handle(
    "events:update",
    (
      _event,
      id: string,
      patch: { title?: string; summary?: string; status?: EventStatus },
    ) => updateEvent(getCurrentProjectPath(), id, patch),
  );
  ipcMain.handle("events:delete", (_event, id: string) =>
    deleteEvent(getCurrentProjectPath(), id),
  );
  ipcMain.handle("events:openWindow", () => {
    openWindow("events");
    return { status: "ok" };
  });

  ipcMain.handle("window:open", (_event, kind: WindowKind) => {
    openWindow(kind);
    return { status: "ok" };
  });

  ipcMain.handle("chat:previewContext", (_event, body) =>
    previewChatContext(getCurrentProjectPath(), body),
  );
  ipcMain.handle("chat:startStream", (event, body) => {
    const { streamId } = startChatStream(
      getCurrentProjectPath(),
      body,
      (chatEvent) => {
        event.sender.send("chat:streamEvent", {
          streamId,
          event: chatEvent.type,
          data:
            typeof chatEvent.data === "string"
              ? chatEvent.data
              : JSON.stringify(chatEvent.data),
        });
      },
    );
    return { streamId };
  });
  ipcMain.handle("chat:stopStream", (_event, streamId: string) =>
    stopChatStream(streamId),
  );

  ipcMain.handle(
    "chat:summarizeThread",
    async (
      _event,
      body: {
        messages: Parameters<typeof generateThreadSummary>[0];
        focusInstructions?: string | null;
        parentMessages?: Parameters<typeof generateThreadSummary>[0];
      },
    ) => {
      const focusNorm =
        typeof body.focusInstructions === "string" && body.focusInstructions.trim().length > 0
          ? body.focusInstructions.trim()
          : undefined;
      console.trace(
        `[main] chat:summarizeThread: messages=${body.messages.length}, ` +
          `parentMessages=${body.parentMessages?.length ?? 0}, ` +
          `focusInstructions=${focusNorm ? "yes" : "no (default)"}`,
      );
      const config = await getProjectConfig(getCurrentProjectPath());
      const result = await generateThreadSummary(
        body.messages,
        config.threadSummaryLlmId ?? null,
        focusNorm,
        body.parentMessages,
      );
      console.trace(`[main] chat:summarizeThread finished`);
      return result;
    },
  );

  ipcMain.handle("llms:list", () => listPublicProviders());
  ipcMain.handle("llms:create", (_event, body) => createProvider(body));
  ipcMain.handle("llms:update", (_event, id: string, body) =>
    updateProvider(id, body),
  );
  ipcMain.handle("llms:remove", (_event, id: string) => deleteProvider(id));

  ipcMain.handle("snapshots:get", (_event, id: string) => getSnapshot(id));
  ipcMain.handle("snapshots:apply", (_event, id: string) => applySnapshot(id));
  ipcMain.handle("snapshots:revert", async (_event, id: string) => {
    const root = getCurrentProjectPath();
    if (!root) {
      return null;
    }
    return revertSnapshot(id, {
      writeFile: (filePath, content) => fs.writeFile(filePath, content, "utf8"),
      deleteFile: (filePath) => fs.unlink(filePath),
    });
  });

  ipcMain.handle("search:project", (_event, query: string, limit?: number) =>
    searchProjectContent(getCurrentProjectPath(), query, limit),
  );

  ipcMain.handle("vector:status", async () => {
    const projectPath = getCurrentProjectPath();
    if (!projectPath) return { indexed: false, indexedAt: null, chunkCount: 0, embeddingModel: null };
    return getIndexStatus(projectPath);
  });

  ipcMain.handle("vector:index", async () => {
    const projectPath = getCurrentProjectPath();
    if (!projectPath) throw new Error("No project is currently open.");
    const providers = await listProviders();
    const provider = providers[0];
    if (!provider) {
      throw new Error("No AI provider configured.");
    }
    const creds = resolveEmbeddingCredentials(provider, false);
    if (!creds) {
      throw new Error(
        "No usable API URL and key for embeddings. Configure Fast or Reasoning on an AI provider.",
      );
    }
    return indexProject(projectPath, {
      apiUrl: creds.apiUrl,
      apiKey: creds.apiKey,
    });
  });

  ipcMain.handle("git:status", () => gitStatus(getCurrentProjectPath()));
  ipcMain.handle("git:commit", (_event, message: string, files?: string[]) =>
    gitCommit(getCurrentProjectPath(), message, files),
  );
  ipcMain.handle(
    "git:revertFile",
    (_event, filePath: string, untracked: boolean) =>
      gitRevertFile(getCurrentProjectPath(), filePath, untracked),
  );
  ipcMain.handle("git:revertDirectory", (_event, dirPath: string) =>
    gitRevertDirectory(getCurrentProjectPath(), dirPath),
  );
  ipcMain.handle("git:diff", () => gitDiff(getCurrentProjectPath()));
  ipcMain.handle("git:log", (_event, limit?: number) =>
    gitLog(getCurrentProjectPath(), limit ?? 20),
  );
  ipcMain.handle("git:init", () => gitInit(getCurrentProjectPath()));
  ipcMain.handle("git:aheadBehind", () => gitAheadBehind(getCurrentProjectPath()));
  ipcMain.handle("git:sync", () => gitSync(getCurrentProjectPath()));
  ipcMain.handle("git:setCredentials", (_event, username: string, token: string) =>
    setGitCredentials(username, token),
  );
  ipcMain.handle("git:fileHistory", (_event, filePath: string) =>
    gitFileHistory(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle("git:fileAtCommit", (_event, filePath: string, hash: string) =>
    gitFileAtCommit(getCurrentProjectPath(), filePath, hash),
  );

  ipcMain.handle(
    "chapter:list",
    (_event, structureRoot?: string | null) =>
      chapterService.listChapters(
        getCurrentProjectPath(),
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:getStructure",
    (_event, chapterId: string, structureRoot?: string | null) =>
      chapterService.getChapterStructure(
        getCurrentProjectPath(),
        chapterId,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:filePaths",
    (_event, chapterId: string, structureRoot?: string | null) =>
      chapterService.getChapterFilePaths(
        getCurrentProjectPath(),
        chapterId,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:create",
    (_event, title: string, structureRoot?: string | null) =>
      chapterService.createChapter(
        getCurrentProjectPath(),
        title,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:updateMeta",
    async (
      _event,
      chapterId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) => {
      await chapterService.updateChapterMeta(
        getCurrentProjectPath(),
        chapterId,
        meta as NodeMeta,
        structureRoot ?? null,
      );
      return { status: "updated" };
    },
  );
  ipcMain.handle(
    "chapter:getComments",
    (_event, chapterId: string, structureRoot?: string | null) =>
      chapterService.readChapterComments(
        getCurrentProjectPath(),
        chapterId,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:saveComments",
    async (
      _event,
      chapterId: string,
      comments: unknown,
      structureRoot?: string | null,
    ) => {
      await chapterService.writeChapterComments(
        getCurrentProjectPath(),
        chapterId,
        (comments as ChapterComment[]) ?? [],
        structureRoot ?? null,
      );
      return { status: "saved" };
    },
  );
  ipcMain.handle(
    "chapter:generateComments",
    async (
      _event,
      chapterId: string,
      chapterText: string,
      categories: ChapterCommentCategoryInput[],
      freeText: string,
      llmId?: string | null,
      structureRoot?: string | null,
    ) => {
      const comments = await generateChapterComments(
        chapterText,
        Array.isArray(categories) ? categories : [],
        typeof freeText === "string" ? freeText : "",
        llmId ?? null,
      );
      await chapterService.writeChapterComments(
        getCurrentProjectPath(),
        chapterId,
        comments,
        structureRoot ?? null,
      );
      return comments;
    },
  );
  ipcMain.handle(
    "chapter:delete",
    async (_event, chapterId: string, structureRoot?: string | null) => {
      await chapterService.deleteChapter(
        getCurrentProjectPath(),
        chapterId,
        structureRoot ?? null,
      );
      return { status: "deleted" };
    },
  );
  ipcMain.handle(
    "chapter:createScene",
    (
      _event,
      chapterId: string,
      title: string,
      structureRoot?: string | null,
    ) =>
      chapterService.createScene(
        getCurrentProjectPath(),
        chapterId,
        title,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:updateSceneMeta",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) => {
      await chapterService.updateSceneMeta(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        meta as NodeMeta,
        structureRoot ?? null,
      );
      return { status: "updated" };
    },
  );
  ipcMain.handle(
    "chapter:deleteScene",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      structureRoot?: string | null,
    ) => {
      await chapterService.deleteScene(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        structureRoot ?? null,
      );
      return { status: "deleted" };
    },
  );
  ipcMain.handle(
    "chapter:createAction",
    (
      _event,
      chapterId: string,
      sceneId: string,
      title: string,
      structureRoot?: string | null,
    ) =>
      chapterService.createAction(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        title,
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "chapter:updateActionMeta",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      actionId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) => {
      await chapterService.updateActionMeta(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        actionId,
        meta as NodeMeta,
        structureRoot ?? null,
      );
      return { status: "updated" };
    },
  );
  ipcMain.handle(
    "chapter:deleteAction",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) => {
      await chapterService.deleteAction(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        actionId,
        structureRoot ?? null,
      );
      return { status: "deleted" };
    },
  );
  ipcMain.handle(
    "chapter:getActionContent",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) => {
      const content = await chapterService.readActionContent(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        actionId,
        structureRoot ?? null,
      );
      return { content };
    },
  );
  ipcMain.handle(
    "chapter:saveActionContent",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      actionId: string,
      content: string,
      structureRoot?: string | null,
    ) => {
      await chapterService.writeActionContent(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        actionId,
        content,
        structureRoot ?? null,
      );
      return { status: "saved" };
    },
  );
  ipcMain.handle(
    "chapter:reorderChapters",
    async (_event, ids: string[], structureRoot?: string | null) => {
      await chapterService.reorderChapters(
        getCurrentProjectPath(),
        ids,
        structureRoot ?? null,
      );
      return { status: "reordered" };
    },
  );
  ipcMain.handle(
    "chapter:reorderScenes",
    async (
      _event,
      chapterId: string,
      ids: string[],
      structureRoot?: string | null,
    ) => {
      await chapterService.reorderScenes(
        getCurrentProjectPath(),
        chapterId,
        ids,
        structureRoot ?? null,
      );
      return { status: "reordered" };
    },
  );
  ipcMain.handle(
    "chapter:reorderActions",
    async (
      _event,
      chapterId: string,
      sceneId: string,
      ids: string[],
      structureRoot?: string | null,
    ) => {
      await chapterService.reorderActions(
        getCurrentProjectPath(),
        chapterId,
        sceneId,
        ids,
        structureRoot ?? null,
      );
      return { status: "reordered" };
    },
  );
  ipcMain.handle(
    "chapter:randomizeIds",
    (_event, structureRoot?: string | null) =>
      chapterService.randomizeIds(
        getCurrentProjectPath(),
        structureRoot ?? null,
      ),
  );

  ipcMain.handle(
    "book:getMeta",
    (_event, structureRoot?: string | null) =>
      chapterService.getBookMeta(
        getCurrentProjectPath(),
        structureRoot ?? null,
      ),
  );
  ipcMain.handle(
    "book:updateMeta",
    async (_event, meta: unknown, structureRoot?: string | null) => {
      await chapterService.updateBookMeta(
        getCurrentProjectPath(),
        meta as NodeMeta,
        structureRoot ?? null,
      );
      return { status: "updated" };
    },
  );

  ipcMain.handle("ensemble:run", (event, req: EnsembleRunRequest) => {
    const runId = `ens-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const send = (payload: Record<string, unknown>) =>
      event.sender.send("ensemble:event", { runId, ...payload });
    void runEnsembleScene(getCurrentProjectPath(), req, (ev) => send(ev))
      .then((result) => send({ phase: "done", result }))
      .catch((err) =>
        send({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    return { runId };
  });

  ipcMain.handle("typedFiles:list", () =>
    listTypedFiles(getCurrentProjectPath()),
  );
  ipcMain.handle("typedFiles:fill", (_event, filePath: string) =>
    fillTypedFile(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle("typedFiles:getContent", (_event, filePath: string) =>
    getTypedFileContent(getCurrentProjectPath(), filePath),
  );
  ipcMain.handle(
    "typedFiles:saveContent",
    (_event, filePath: string, data: unknown) =>
      saveTypedFileContent(
        getCurrentProjectPath(),
        filePath,
        data as Record<string, unknown>,
      ),
  );

  ipcMain.handle("projectConfig:status", () =>
    getProjectConfigStatus(getCurrentProjectPath()),
  );
  ipcMain.handle(
    "projectConfig:getWorkspaceMode",
    (_event, modeId?: string | null) =>
      getWorkspaceMode(getCurrentProjectPath(), modeId),
  );
  ipcMain.handle("projectConfig:listWorkspaceModes", () =>
    listWorkspaceModes(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:getWorkspaceModesDataDir", () =>
    getWorkspaceModesDataDir(),
  );
  ipcMain.handle("projectConfig:revealWorkspaceModesDataDir", () =>
    revealWorkspaceModesDataDir(),
  );
  ipcMain.handle("projectConfig:get", () =>
    getProjectConfig(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:init", () =>
    initProjectConfig(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:initFromFile", async () => {
    const result = await dialog.showOpenDialog({
      title: "Einstellungsdatei auswählen",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return initProjectConfigFromFile(
      getCurrentProjectPath(),
      result.filePaths[0],
    );
  });
  ipcMain.handle("projectConfig:update", (_event, config) =>
    saveProjectConfig(getCurrentProjectPath(), config),
  );
  ipcMain.handle("projectConfig:getModes", () =>
    listProjectModes(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:saveMode", (_event, id: string, mode) =>
    saveProjectMode(getCurrentProjectPath(), id, mode),
  );
  ipcMain.handle("projectConfig:deleteMode", (_event, id: string) =>
    removeProjectMode(getCurrentProjectPath(), id),
  );
  ipcMain.handle("projectConfig:resetModes", () =>
    resetProjectModes(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:getCommentCategories", () =>
    listCommentCategories(getCurrentProjectPath()),
  );
  ipcMain.handle(
    "projectConfig:saveCommentCategory",
    (_event, id: string, category) =>
      saveProjectCommentCategory(getCurrentProjectPath(), id, category),
  );
  ipcMain.handle("projectConfig:deleteCommentCategory", (_event, id: string) =>
    removeCommentCategory(getCurrentProjectPath(), id),
  );
  ipcMain.handle("projectConfig:resetCommentCategories", () =>
    resetProjectCommentCategories(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:notifyChanged", () => {
    broadcast("workspace:changed", { reason: "settings" });
    return { status: "ok" };
  });
  ipcMain.handle("preferences:get", () => getPreferences());
  ipcMain.handle("preferences:set", (_event, patch) =>
    patchPreferences(patch),
  );

  ipcMain.handle("window:minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle("spellcheck:fixAtCursor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { status: "no-window" };
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
      return { status: "cursor-outside-window" };
    }
    pendingSpellFixWindowId = win.id;
    win.webContents.sendInputEvent({
      type: "mouseDown",
      x,
      y,
      button: "right",
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x,
      y,
      button: "right",
      clickCount: 1,
    });
    return { status: "ok" };
  });

  ipcMain.handle("shell:openDevTools", (event) => {
    console.log("[electron] Received shell:openDevTools");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.openDevTools();
      console.log("[electron] Finished shell:openDevTools");
    } else {
      console.warn("[electron] shell:openDevTools: no window for sender");
    }
  });
}

/** Set by the `spellcheck:fixAtCursor` IPC handler right before it simulates a right-click
 * to trigger Chromium's native context-menu event; tells that handler to silently apply the
 * first suggestion instead of popping up the menu. */
let pendingSpellFixWindowId: number | null = null;

type WindowKind = "book" | "storyboard" | "chat" | "events" | "settings";

const WINDOW_CONFIG: Record<
  WindowKind,
  { width: number; height: number; title: string }
> = {
  book: { width: 1400, height: 900, title: "Buch-Schreibtool" },
  storyboard: { width: 1200, height: 820, title: "Pinnwand" },
  chat: { width: 900, height: 800, title: "KI-Chat" },
  events: { width: 420, height: 620, title: "Ereignisse" },
  settings: { width: 640, height: 720, title: "Einstellungen" },
};

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "../../build/icon.png");

/** One live OS window per kind; reused/focused instead of duplicated. */
const windows = new Map<WindowKind, BrowserWindow>();

/** Fan-out a main→renderer event to every open window (multi-window sync). */
function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function openWindow(kind: WindowKind): void {
  const existing = windows.get(kind);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const cfg = WINDOW_CONFIG[kind];
  const win = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    title: cfg.title,
    icon: appIconPath,
    webPreferences: {
      /** CJS-Bundle (`preload.cjs` via esbuild): `tsc`-ESM-Preload + `"type":"module"` führt oft dazu, dass der Preload nicht läuft → kein `window.appBridge`. */
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  windows.set(kind, win);
  win.on("closed", () => {
    if (windows.get(kind) === win) windows.delete(kind);
  });
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(
      `[electron] preload-error path=${preloadPath}`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
  });
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "F12" && input.type === "keyDown") {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.on("context-menu", (_event, params) => {
    if (pendingSpellFixWindowId === win.id) {
      pendingSpellFixWindowId = null;
      if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
        win.webContents.replaceMisspelling(params.dictionarySuggestions[0]);
      }
      return;
    }

    const menu = new Menu();

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion),
          }),
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(
        new MenuItem({
          label: "Zum Wörterbuch hinzufügen",
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        }),
      );
      menu.append(new MenuItem({ type: "separator" }));
    }

    if (params.isEditable) {
      menu.append(
        new MenuItem({
          label: "Ausschneiden",
          role: "cut",
          enabled: params.editFlags.canCut,
        }),
      );
      menu.append(
        new MenuItem({
          label: "Kopieren",
          role: "copy",
          enabled: params.editFlags.canCopy,
        }),
      );
      menu.append(
        new MenuItem({
          label: "Einfügen",
          role: "paste",
          enabled: params.editFlags.canPaste,
        }),
      );
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: "Kopieren", role: "copy" }));
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  const query = kind === "book" ? undefined : { window: kind };
  if (!app.isPackaged) {
    const suffix = query ? `/?window=${kind}` : "";
    void win.loadURL(`http://localhost:5173${suffix}`);
  } else {
    /** `main` liegt unter `dist-electron/electron/`; Vite-Build ist `dist/` neben `dist-electron/`. */
    void win.loadFile(
      path.join(__dirname, "../../dist/index.html"),
      query ? { query } : undefined,
    );
  }
}

/**
 * Tray-only background app (JetBrains-Toolbox style): no window opens on start.
 * The tray's right-click menu opens the individual feature windows via
 * `openWindow(kind)`; all windows share the same preload and the main-process
 * `getCurrentProjectPath()` singleton, so they share the open project without
 * extra wiring.
 */
let tray: Tray | null = null;

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: "Buch-Schreibtool", click: () => openWindow("book") },
    { label: "Pinnwand", click: () => openWindow("storyboard") },
    { label: "KI-Chat", click: () => openWindow("chat") },
    { label: "Ereignisse", click: () => openWindow("events") },
    { label: "Einstellungen", click: () => openWindow("settings") },
    { type: "separator" },
    {
      label: "Beim Login starten",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          openAsHidden: true,
        });
      },
    },
    { type: "separator" },
    {
      label: "Beenden",
      click: () => {
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  tray = new Tray(appIconPath);
  tray.setToolTip("Markdown Workspace");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => openWindow("book"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openWindow("book"));

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    registerIpcHandlers();
    await restoreLastProject();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openWindow("book");
      }
    });
  });
}

/** Background app: closing all windows must NOT quit — the app lives in the
 * tray until the tray's "Beenden" entry calls `app.quit()`. */
app.on("window-all-closed", () => {});
