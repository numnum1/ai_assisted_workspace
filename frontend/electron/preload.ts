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
  search: {
    query: (q: string, limit?: number) =>
      ipcRenderer.invoke("search:project", q, limit),
  },
  git: {
    status: () => ipcRenderer.invoke("git:status"),
    commit: (message: string, files?: string[]) =>
      ipcRenderer.invoke("git:commit", message, files),
    revertFile: (filePath: string, untracked: boolean) =>
      ipcRenderer.invoke("git:revertFile", filePath, untracked),
    revertDirectory: (dirPath: string) =>
      ipcRenderer.invoke("git:revertDirectory", dirPath),
    diff: () => ipcRenderer.invoke("git:diff"),
    log: (limit?: number) => ipcRenderer.invoke("git:log", limit),
    init: () => ipcRenderer.invoke("git:init"),
    aheadBehind: () => ipcRenderer.invoke("git:aheadBehind"),
    sync: () => ipcRenderer.invoke("git:sync"),
    setCredentials: (username: string, token: string) =>
      ipcRenderer.invoke("git:setCredentials", username, token),
    fileHistory: (filePath: string) =>
      ipcRenderer.invoke("git:fileHistory", filePath),
    fileAtCommit: (filePath: string, hash: string) =>
      ipcRenderer.invoke("git:fileAtCommit", filePath, hash),
  },
  chapter: {
    list: (structureRoot?: string | null) =>
      ipcRenderer.invoke("chapter:list", structureRoot ?? null),
    getStructure: (chapterId: string, structureRoot?: string | null) =>
      ipcRenderer.invoke("chapter:getStructure", chapterId, structureRoot ?? null),
    create: (title: string, structureRoot?: string | null) =>
      ipcRenderer.invoke("chapter:create", title, structureRoot ?? null),
    updateMeta: (
      chapterId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:updateMeta",
        chapterId,
        meta,
        structureRoot ?? null,
      ),
    delete: (chapterId: string, structureRoot?: string | null) =>
      ipcRenderer.invoke("chapter:delete", chapterId, structureRoot ?? null),
    createScene: (
      chapterId: string,
      title: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:createScene",
        chapterId,
        title,
        structureRoot ?? null,
      ),
    updateSceneMeta: (
      chapterId: string,
      sceneId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:updateSceneMeta",
        chapterId,
        sceneId,
        meta,
        structureRoot ?? null,
      ),
    deleteScene: (
      chapterId: string,
      sceneId: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:deleteScene",
        chapterId,
        sceneId,
        structureRoot ?? null,
      ),
    createAction: (
      chapterId: string,
      sceneId: string,
      title: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:createAction",
        chapterId,
        sceneId,
        title,
        structureRoot ?? null,
      ),
    updateActionMeta: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      meta: unknown,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:updateActionMeta",
        chapterId,
        sceneId,
        actionId,
        meta,
        structureRoot ?? null,
      ),
    deleteAction: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:deleteAction",
        chapterId,
        sceneId,
        actionId,
        structureRoot ?? null,
      ),
    getActionContent: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:getActionContent",
        chapterId,
        sceneId,
        actionId,
        structureRoot ?? null,
      ),
    saveActionContent: (
      chapterId: string,
      sceneId: string,
      actionId: string,
      content: string,
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:saveActionContent",
        chapterId,
        sceneId,
        actionId,
        content,
        structureRoot ?? null,
      ),
    reorderScenes: (
      chapterId: string,
      ids: string[],
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:reorderScenes",
        chapterId,
        ids,
        structureRoot ?? null,
      ),
    reorderActions: (
      chapterId: string,
      sceneId: string,
      ids: string[],
      structureRoot?: string | null,
    ) =>
      ipcRenderer.invoke(
        "chapter:reorderActions",
        chapterId,
        sceneId,
        ids,
        structureRoot ?? null,
      ),
    randomizeIds: (structureRoot?: string | null) =>
      ipcRenderer.invoke("chapter:randomizeIds", structureRoot ?? null),
  },
  book: {
    getMeta: (structureRoot?: string | null) =>
      ipcRenderer.invoke("book:getMeta", structureRoot ?? null),
    updateMeta: (meta: unknown, structureRoot?: string | null) =>
      ipcRenderer.invoke("book:updateMeta", meta, structureRoot ?? null),
  },
  typedFiles: {
    fill: (filePath: string) => ipcRenderer.invoke("typedFiles:fill", filePath),
    getContent: (filePath: string) =>
      ipcRenderer.invoke("typedFiles:getContent", filePath),
    saveContent: (filePath: string, data: unknown) =>
      ipcRenderer.invoke("typedFiles:saveContent", filePath, data),
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
