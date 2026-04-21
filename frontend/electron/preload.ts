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
    open: (path: string) => ipcRenderer.invoke("project:open", path),
  },
  files: {
    getTree: () => ipcRenderer.invoke("files:getTree"),
    getContent: (path: string) => ipcRenderer.invoke("files:getContent", path),
    saveContent: (path: string, content: string) =>
      ipcRenderer.invoke("files:saveContent", path, content),
    deleteContent: (path: string) =>
      ipcRenderer.invoke("files:deleteContent", path),
    createFile: (parentPath: string, name: string) =>
      ipcRenderer.invoke("files:createFile", parentPath, name),
    createFolder: (parentPath: string, name: string) =>
      ipcRenderer.invoke("files:createFolder", parentPath, name),
    rename: (path: string, newName: string) =>
      ipcRenderer.invoke("files:rename", path, newName),
    move: (path: string, targetParentPath: string) =>
      ipcRenderer.invoke("files:move", path, targetParentPath),
  },
});
