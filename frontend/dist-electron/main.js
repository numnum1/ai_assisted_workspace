import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browseForProject, getCurrentProject, getCurrentProjectPath, openProject, revealProject, } from "./services/projectService.js";
import { createFile, createFolder, deleteContent, getContent, getTree, movePath, renamePath, saveContent, } from "./services/filesService.js";
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