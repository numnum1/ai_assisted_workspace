import { app, BrowserWindow, ipcMain, Menu } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeMeta } from "../src/types.js";
import {
  browseForProject,
  getCurrentProject,
  getCurrentProjectPath,
  openProject,
  revealProject,
} from "./services/projectService.js";
import {
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
  deleteProjectAgent as removeAgentPreset,
  deleteProjectMode as removeProjectMode,
  getProjectConfig,
  getProjectConfigStatus,
  getWorkspaceMode,
  getWorkspaceModesDataDir,
  initProjectConfig,
  listProjectAgents as listAgentPresets,
  getProjectModes as listProjectModes,
  listWorkspaceModes,
  revealWorkspaceModesDataDir,
  saveProjectAgent as saveAgentPreset,
  updateProjectConfig as saveProjectConfig,
  saveProjectMode,
} from "./services/projectConfigService.js";
import {
  getSubprojectInfo,
  initSubproject,
  removeSubproject,
} from "./services/subprojectService.js";
import { listWikiFiles, searchWiki } from "./services/wikiService.js";
import {
  previewChatContext,
  startChatStream,
  stopChatStream,
} from "./services/chatService.js";
import {
  addGlossaryEntry,
  deleteGlossaryEntry,
  getGlossary,
} from "./services/glossaryService.js";
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
} from "./services/typedFilesService.js";
import { searchProjectContent } from "./services/searchService.js";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function registerIpcHandlers(): void {
  ipcMain.handle("project:current", () => getCurrentProject());
  ipcMain.handle("project:reveal", () => revealProject());
  ipcMain.handle("project:browse", () => browseForProject());
  ipcMain.handle("project:open", (_event, projectPath: string) =>
    openProject(projectPath),
  );

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
  ipcMain.handle("wiki:search", (_event, query: string, limit?: number) =>
    searchWiki(getCurrentProjectPath(), query, limit),
  );

  ipcMain.handle("glossary:get", () => getGlossary(getCurrentProjectPath()));
  ipcMain.handle(
    "glossary:addEntry",
    (_event, term: string, definition: string) =>
      addGlossaryEntry(getCurrentProjectPath(), term, definition),
  );
  ipcMain.handle("glossary:deleteEntry", (_event, term: string) =>
    deleteGlossaryEntry(getCurrentProjectPath(), term),
  );

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
  ipcMain.handle("projectConfig:listAgents", () =>
    listAgentPresets(getCurrentProjectPath()),
  );
  ipcMain.handle("projectConfig:saveAgent", (_event, id: string, preset) =>
    saveAgentPreset(getCurrentProjectPath(), id, preset),
  );
  ipcMain.handle("projectConfig:deleteAgent", (_event, id: string) =>
    removeAgentPreset(getCurrentProjectPath(), id),
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    void win.loadURL("http://localhost:5173");
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
