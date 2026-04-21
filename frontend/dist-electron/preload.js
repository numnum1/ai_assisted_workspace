import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("appBridge", {
    platform: process.platform,
    isElectron: true,
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },
    project: {
        current: () => ipcRenderer.invoke("project:current"),
        reveal: () => ipcRenderer.invoke("project:reveal"),
        browse: () => ipcRenderer.invoke("project:browse"),
        open: (path) => ipcRenderer.invoke("project:open", path),
    },
    files: {
        getTree: () => ipcRenderer.invoke("files:getTree"),
        getContent: (path) => ipcRenderer.invoke("files:getContent", path),
        saveContent: (path, content) => ipcRenderer.invoke("files:saveContent", path, content),
        deleteContent: (path) => ipcRenderer.invoke("files:deleteContent", path),
        createFile: (parentPath, name) => ipcRenderer.invoke("files:createFile", parentPath, name),
        createFolder: (parentPath, name) => ipcRenderer.invoke("files:createFolder", parentPath, name),
        rename: (path, newName) => ipcRenderer.invoke("files:rename", path, newName),
        move: (path, targetParentPath) => ipcRenderer.invoke("files:move", path, targetParentPath),
    },
});
//# sourceMappingURL=preload.js.map