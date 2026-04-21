import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browseForProject, getCurrentProject, getCurrentProjectPath, openProject, revealProject, } from "./services/projectService.ts";
import { createFile, createFolder, deleteContent, getContent, getTree, movePath, renamePath, saveContent, } from "./services/filesService.ts";
import { deleteProjectAgent as removeAgentPreset, deleteProjectMode as removeProjectMode, getProjectConfig, getProjectConfigStatus, getWorkspaceMode, getWorkspaceModesDataDir, initProjectConfig, listProjectAgents as listAgentPresets, getProjectModes as listProjectModes, listWorkspaceModes, revealWorkspaceModesDataDir, saveProjectAgent as saveAgentPreset, updateProjectConfig as saveProjectConfig, saveProjectMode, } from "./services/projectConfigService.ts";
import { getSubprojectInfo, initSubproject, removeSubproject, } from "./services/subprojectService.ts";
import { listWikiFiles, searchWiki } from "./services/wikiService.ts";
import { addGlossaryEntry, deleteGlossaryEntry, getGlossary, } from "./services/glossaryService.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function registerIpcHandlers() {
    ipcMain.handle("project:current", () => getCurrentProject());
    ipcMain.handle("project:reveal", () => revealProject());
    ipcMain.handle("project:browse", () => browseForProject());
    ipcMain.handle("project:open", (_event, projectPath) => openProject(projectPath));
    ipcMain.handle("files:getTree", () => getTree(getCurrentProjectPath()));
    ipcMain.handle("files:getContent", (_event, filePath) => getContent(getCurrentProjectPath(), filePath));
    ipcMain.handle("files:saveContent", (_event, filePath, content) => saveContent(getCurrentProjectPath(), filePath, content));
    ipcMain.handle("files:deleteContent", (_event, filePath) => deleteContent(getCurrentProjectPath(), filePath));
    ipcMain.handle("files:createFile", (_event, parentPath, name) => createFile(getCurrentProjectPath(), parentPath, name));
    ipcMain.handle("files:createFolder", (_event, parentPath, name) => createFolder(getCurrentProjectPath(), parentPath, name));
    ipcMain.handle("files:rename", (_event, filePath, newName) => renamePath(getCurrentProjectPath(), filePath, newName));
    ipcMain.handle("files:move", (_event, filePath, targetParentPath) => movePath(getCurrentProjectPath(), filePath, targetParentPath));
    ipcMain.handle("subproject:info", (_event, targetPath) => getSubprojectInfo(getCurrentProjectPath(), targetPath));
    ipcMain.handle("subproject:init", (_event, targetPath, type, name) => initSubproject(getCurrentProjectPath(), targetPath, type, name));
    ipcMain.handle("subproject:remove", (_event, targetPath) => removeSubproject(getCurrentProjectPath(), targetPath));
    ipcMain.handle("wiki:listFiles", () => listWikiFiles(getCurrentProjectPath()));
    ipcMain.handle("wiki:search", (_event, query, limit) => searchWiki(getCurrentProjectPath(), query, limit));
    ipcMain.handle("glossary:get", () => getGlossary(getCurrentProjectPath()));
    ipcMain.handle("glossary:addEntry", (_event, term, definition) => addGlossaryEntry(getCurrentProjectPath(), term, definition));
    ipcMain.handle("glossary:deleteEntry", (_event, term) => deleteGlossaryEntry(getCurrentProjectPath(), term));
    ipcMain.handle("projectConfig:status", () => getProjectConfigStatus(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:getWorkspaceMode", (_event, modeId) => getWorkspaceMode(getCurrentProjectPath(), modeId));
    ipcMain.handle("projectConfig:listWorkspaceModes", () => listWorkspaceModes(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:getWorkspaceModesDataDir", () => getWorkspaceModesDataDir());
    ipcMain.handle("projectConfig:revealWorkspaceModesDataDir", () => revealWorkspaceModesDataDir());
    ipcMain.handle("projectConfig:get", () => getProjectConfig(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:init", () => initProjectConfig(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:update", (_event, config) => saveProjectConfig(getCurrentProjectPath(), config));
    ipcMain.handle("projectConfig:getModes", () => listProjectModes(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:saveMode", (_event, id, mode) => saveProjectMode(getCurrentProjectPath(), id, mode));
    ipcMain.handle("projectConfig:deleteMode", (_event, id) => removeProjectMode(getCurrentProjectPath(), id));
    ipcMain.handle("projectConfig:listAgents", () => listAgentPresets(getCurrentProjectPath()));
    ipcMain.handle("projectConfig:saveAgent", (_event, id, preset) => saveAgentPreset(getCurrentProjectPath(), id, preset));
    ipcMain.handle("projectConfig:deleteAgent", (_event, id) => removeAgentPreset(getCurrentProjectPath(), id));
}
function createWindow() {
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
    }
    else {
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
//# sourceMappingURL=main.js.map