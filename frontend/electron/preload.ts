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
    getContent: (path: string) => ipcRenderer.invoke("files:getContent", path),
    saveContent: (path: string, content: string) =>
      ipcRenderer.invoke("files:saveContent", path, content),
  },
  simulation: {
    listBooks: () => ipcRenderer.invoke("simulation:listBooks"),
    writeResult: (name: string, content: string) =>
      ipcRenderer.invoke("simulation:writeResult", name, content),
    readResult: (name: string) =>
      ipcRenderer.invoke("simulation:readResult", name),
    listResults: () => ipcRenderer.invoke("simulation:listResults"),
    generateUserReply: (req: unknown) =>
      ipcRenderer.invoke("simulation:generateUserReply", req),
    evaluateRun: (req: unknown) =>
      ipcRenderer.invoke("simulation:evaluateRun", req),
  },
  persona: {
    list: () => ipcRenderer.invoke("persona:list"),
    read: (id: string) => ipcRenderer.invoke("persona:read", id),
    write: (name: string, description: string) =>
      ipcRenderer.invoke("persona:write", name, description),
    delete: (id: string) => ipcRenderer.invoke("persona:delete", id),
  },
  snapshots: {
    get: (id: string) => ipcRenderer.invoke("snapshots:get", id),
    apply: (id: string) => ipcRenderer.invoke("snapshots:apply", id),
    revert: (id: string) => ipcRenderer.invoke("snapshots:revert", id),
  },
  chat: {
    previewContext: (body: unknown) =>
      ipcRenderer.invoke("chat:previewContext", body),
    startStream: (body: unknown) =>
      ipcRenderer.invoke("chat:startStream", body),
    stopStream: (streamId: string) =>
      ipcRenderer.invoke("chat:stopStream", streamId),
    summarizeThread: (body: unknown) =>
      ipcRenderer.invoke("chat:summarizeThread", body),
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
  llms: {
    list: () => ipcRenderer.invoke("llms:list"),
    create: (body: unknown) => ipcRenderer.invoke("llms:create", body),
    update: (id: string, body: unknown) =>
      ipcRenderer.invoke("llms:update", id, body),
    remove: (id: string) => ipcRenderer.invoke("llms:remove", id),
  },
  wiki: {
    listFiles: () => ipcRenderer.invoke("wiki:listFiles"),
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke("wiki:search", query, limit),
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
    initFromFile: () => ipcRenderer.invoke("projectConfig:initFromFile"),
    update: (config: unknown) =>
      ipcRenderer.invoke("projectConfig:update", config),
    getModes: () => ipcRenderer.invoke("projectConfig:getModes"),
    saveMode: (id: string, mode: unknown) =>
      ipcRenderer.invoke("projectConfig:saveMode", id, mode),
    deleteMode: (id: string) =>
      ipcRenderer.invoke("projectConfig:deleteMode", id),
    resetModes: () => ipcRenderer.invoke("projectConfig:resetModes"),
    getCommentCategories: () =>
      ipcRenderer.invoke("projectConfig:getCommentCategories"),
    saveCommentCategory: (id: string, category: unknown) =>
      ipcRenderer.invoke("projectConfig:saveCommentCategory", id, category),
    deleteCommentCategory: (id: string) =>
      ipcRenderer.invoke("projectConfig:deleteCommentCategory", id),
    resetCommentCategories: () =>
      ipcRenderer.invoke("projectConfig:resetCommentCategories"),
    listAgents: () => ipcRenderer.invoke("projectConfig:listAgents"),
    saveAgent: (id: string, preset: unknown) =>
      ipcRenderer.invoke("projectConfig:saveAgent", id, preset),
    deleteAgent: (id: string) =>
      ipcRenderer.invoke("projectConfig:deleteAgent", id),
  },
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    set: (patch: unknown) => ipcRenderer.invoke("preferences:set", patch),
  },
  shell: {
    openDevTools: () => ipcRenderer.invoke("shell:openDevTools"),
  },
  spellcheck: {
    fixAtCursor: () => ipcRenderer.invoke("spellcheck:fixAtCursor"),
  },
});
