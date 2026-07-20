import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("appBridge", {
  platform: process.platform,
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  simulation: {
    generateUserReply: (req: unknown) =>
      ipcRenderer.invoke("simulation:generateUserReply", req),
    evaluateRun: (req: unknown) =>
      ipcRenderer.invoke("simulation:evaluateRun", req),
    listRuns: () => ipcRenderer.invoke("simulation:listRuns"),
  },
  persona: {
    list: () => ipcRenderer.invoke("persona:list"),
    read: (id: string) => ipcRenderer.invoke("persona:read", id),
    write: (name: string, description: string) =>
      ipcRenderer.invoke("persona:write", name, description),
    delete: (id: string) => ipcRenderer.invoke("persona:delete", id),
  },
  chat: {
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
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    set: (patch: unknown) => ipcRenderer.invoke("preferences:set", patch),
  },
  navi: {
    getStates: () => ipcRenderer.invoke("navi:getStates"),
    setStates: (states: unknown) => ipcRenderer.invoke("navi:setStates", states),
    resetStates: () => ipcRenderer.invoke("navi:resetStates"),
    getTips: () => ipcRenderer.invoke("navi:getTips"),
    setTips: (tips: unknown) => ipcRenderer.invoke("navi:setTips", tips),
    resetTips: () => ipcRenderer.invoke("navi:resetTips"),
    getPersona: () => ipcRenderer.invoke("navi:getPersona"),
    setPersona: (persona: unknown) => ipcRenderer.invoke("navi:setPersona", persona),
    resetPersona: () => ipcRenderer.invoke("navi:resetPersona"),
    getUseCases: () => ipcRenderer.invoke("navi:getUseCases"),
    setUseCases: (useCases: unknown) => ipcRenderer.invoke("navi:setUseCases", useCases),
    resetUseCases: () => ipcRenderer.invoke("navi:resetUseCases"),
    getTools: () => ipcRenderer.invoke("navi:getTools"),
    setTools: (tools: unknown) => ipcRenderer.invoke("navi:setTools", tools),
    resetTools: () => ipcRenderer.invoke("navi:resetTools"),
    proposeImprovement: (conversationMarkdown: string, llmId?: string) =>
      ipcRenderer.invoke("navi:proposeImprovement", conversationMarkdown, llmId),
    getImprovementLlm: () => ipcRenderer.invoke("navi:getImprovementLlm"),
    setImprovementLlm: (input: unknown) => ipcRenderer.invoke("navi:setImprovementLlm", input),
    resetImprovementLlm: () => ipcRenderer.invoke("navi:resetImprovementLlm"),
    listProfiles: () => ipcRenderer.invoke("navi:profiles:list"),
    setActiveProfile: (id: string) => ipcRenderer.invoke("navi:profiles:setActive", id),
    createProfile: (name: string, fromId?: string) =>
      ipcRenderer.invoke("navi:profiles:create", name, fromId),
    renameProfile: (id: string, name: string) =>
      ipcRenderer.invoke("navi:profiles:rename", id, name),
    deleteProfile: (id: string) => ipcRenderer.invoke("navi:profiles:delete", id),
    exportProfile: (id: string) => ipcRenderer.invoke("navi:profiles:export", id),
    importProfile: () => ipcRenderer.invoke("navi:profiles:import"),
  },
  shell: {
    openDevTools: () => ipcRenderer.invoke("shell:openDevTools"),
  },
  spellcheck: {
    fixAtCursor: () => ipcRenderer.invoke("spellcheck:fixAtCursor"),
  },
});
