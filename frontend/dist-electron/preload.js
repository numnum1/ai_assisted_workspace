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
    wiki: {
        listFiles: () => ipcRenderer.invoke("wiki:listFiles"),
        search: (query, limit) => ipcRenderer.invoke("wiki:search", query, limit),
    },
    glossary: {
        get: () => ipcRenderer.invoke("glossary:get"),
        addEntry: (term, definition) => ipcRenderer.invoke("glossary:addEntry", term, definition),
        deleteEntry: (term) => ipcRenderer.invoke("glossary:deleteEntry", term),
    },
    subproject: {
        info: (path) => ipcRenderer.invoke("subproject:info", path),
        init: (path, type, name) => ipcRenderer.invoke("subproject:init", path, type, name),
        remove: (path) => ipcRenderer.invoke("subproject:remove", path),
    },
    projectConfig: {
        status: () => ipcRenderer.invoke("projectConfig:status"),
        getWorkspaceMode: (modeId) => ipcRenderer.invoke("projectConfig:getWorkspaceMode", modeId ?? null),
        listWorkspaceModes: () => ipcRenderer.invoke("projectConfig:listWorkspaceModes"),
        getWorkspaceModesDataDir: () => ipcRenderer.invoke("projectConfig:getWorkspaceModesDataDir"),
        revealWorkspaceModesDataDir: () => ipcRenderer.invoke("projectConfig:revealWorkspaceModesDataDir"),
        get: () => ipcRenderer.invoke("projectConfig:get"),
        init: () => ipcRenderer.invoke("projectConfig:init"),
        update: (config) => ipcRenderer.invoke("projectConfig:update", config),
        getModes: () => ipcRenderer.invoke("projectConfig:getModes"),
        saveMode: (id, mode) => ipcRenderer.invoke("projectConfig:saveMode", id, mode),
        deleteMode: (id) => ipcRenderer.invoke("projectConfig:deleteMode", id),
        listAgents: () => ipcRenderer.invoke("projectConfig:listAgents"),
        saveAgent: (id, preset) => ipcRenderer.invoke("projectConfig:saveAgent", id, preset),
        deleteAgent: (id) => ipcRenderer.invoke("projectConfig:deleteAgent", id),
    },
});
//# sourceMappingURL=preload.js.map