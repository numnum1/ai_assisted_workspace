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
  chat: {
    previewContext: (body: unknown) =>
      ipcRenderer.invoke("chat:previewContext", body),
    startStream: (body: unknown) =>
      ipcRenderer.invoke("chat:startStream", body),
    stopStream: (streamId: string) =>
      ipcRenderer.invoke("chat:stopStream", streamId),
    onStreamEvent: (streamId: string, listener: (payload: unknown) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        if (
          payload &&
          typeof payload === "object" &&
          "streamId" in payload &&
          (payload as { streamId?: unknown }).streamId === streamId
        ) {
          listener(payload);
        }
      };
      ipcRenderer.on("chat:streamEvent", wrapped);
      return {
        unsubscribe: () => {
          ipcRenderer.removeListener("chat:streamEvent", wrapped);
        },
      };
    },
  },
  wiki: {
    listFiles: () => ipcRenderer.invoke("wiki:listFiles"),
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke("wiki:search", query, limit),
  },
  glossary: {
    get: () => ipcRenderer.invoke("glossary:get"),
    addEntry: (term: string, definition: string) =>
      ipcRenderer.invoke("glossary:addEntry", term, definition),
    deleteEntry: (term: string) =>
      ipcRenderer.invoke("glossary:deleteEntry", term),
  },
  subproject: {
    info: (path: string) => ipcRenderer.invoke("subproject:info", path),
    init: (path: string, type: string, name: string) =>
      ipcRenderer.invoke("subproject:init", path, type, name),
    remove: (path: string) => ipcRenderer.invoke("subproject:remove", path),
  },
  projectConfig: {
    status: () => ipcRenderer.invoke("projectConfig:status"),
    getWorkspaceMode: (modeId?: string | null) =>
      ipcRenderer.invoke("projectConfig:getWorkspaceMode", modeId ?? null),
    listWorkspaceModes: () =>
      ipcRenderer.invoke("projectConfig:listWorkspaceModes"),
    getWorkspaceModesDataDir: () =>
      ipcRenderer.invoke("projectConfig:getWorkspaceModesDataDir"),
    revealWorkspaceModesDataDir: () =>
      ipcRenderer.invoke("projectConfig:revealWorkspaceModesDataDir"),
    get: () => ipcRenderer.invoke("projectConfig:get"),
    init: () => ipcRenderer.invoke("projectConfig:init"),
    update: (config: unknown) =>
      ipcRenderer.invoke("projectConfig:update", config),
    getModes: () => ipcRenderer.invoke("projectConfig:getModes"),
    saveMode: (id: string, mode: unknown) =>
      ipcRenderer.invoke("projectConfig:saveMode", id, mode),
    deleteMode: (id: string) =>
      ipcRenderer.invoke("projectConfig:deleteMode", id),
    listAgents: () => ipcRenderer.invoke("projectConfig:listAgents"),
    saveAgent: (id: string, preset: unknown) =>
      ipcRenderer.invoke("projectConfig:saveAgent", id, preset),
    deleteAgent: (id: string) =>
      ipcRenderer.invoke("projectConfig:deleteAgent", id),
  },
});
