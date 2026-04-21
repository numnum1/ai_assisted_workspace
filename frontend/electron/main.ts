import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  browseForProject,
  getCurrentProject,
  getCurrentProjectPath,
  openProject,
  revealProject,
} from "./services/projectService.ts";
import {
  createFile,
  createFolder,
  deleteContent,
  getContent,
  getTree,
  movePath,
  renamePath,
  saveContent,
} from "./services/filesService.ts";
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
} from "./services/projectConfigService.ts";
import {
  getSubprojectInfo,
  initSubproject,
  removeSubproject,
} from "./services/subprojectService.ts";
import { listWikiFiles, searchWiki } from "./services/wikiService.ts";
import {
  previewChatContext,
  startChatStream,
  stopChatStream,
} from "./services/chatService.ts";
import {
  addGlossaryEntry,
  deleteGlossaryEntry,
  getGlossary,
} from "./services/glossaryService.ts";

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
    const { streamId } = startChatStream(body, (chatEvent) => {
      event.sender.send("chat:streamEvent", {
        streamId,
        event: chatEvent.type,
        data:
          typeof chatEvent.data === "string"
            ? chatEvent.data
            : JSON.stringify(chatEvent.data),
      });
    });
    return { streamId };
  });
  ipcMain.handle("chat:stopStream", (_event, streamId: string) =>
    stopChatStream(streamId),
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
