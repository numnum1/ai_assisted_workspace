import type {
  AgentPreset,
  FileNode,
  Mode,
  ChatRequest,
  ChatMessage,
  ProjectConfig,
  CommentCategoryDef,
  WorkspaceModeSchema,
  WorkspaceModeInfo,
  LlmPublic,
  LlmsListResponse,
  Conversation,
} from "./types.ts";
import type { ChatStreamEvent } from "./electron/bridge.ts";
import {
  buildConversationById,
  effectiveSavedToProject,
} from "./components/chat/chatHistoryUtils.ts";
import { getAppBridge } from "./electron/bridge.ts";

type FileContentResponse = { path: string; content: string; lines: number };
type ProjectCurrentResponse = {
  path: string;
  hasProject: boolean;
  initialized: boolean;
};
type ProjectBrowseResponse = { cancelled: boolean; path?: string };
type ProjectOpenResponse = {
  status: string;
  path: string;
  tree: FileNode;
  initialized: boolean;
};
type ProjectConfigStatusResponse = { initialized: boolean };
type SnapshotResponse = {
  id: string;
  path: string;
  oldContent: string;
  wasNew: boolean;
};
type SnapshotApplyResponse = { status: string };
type SnapshotRevertResponse = {
  status: string;
  path: string;
  wasNew: boolean;
};

function getElectronApi() {
  return getAppBridge();
}

export const filesApi = {
  getContent: async (path: string): Promise<FileContentResponse> => {
    const api = getElectronApi();
    if (api?.files) return api.files.getContent(path);
    throw new Error("Electron bridge not available");
  },
  saveContent: async (
    path: string,
    content: string,
  ): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.files) return api.files.saveContent(path, content);
    throw new Error("Electron bridge not available");
  },
};

/** Persisted chat subset for Git sync (see useChatHistory) */
export const PROJECT_CHAT_HISTORY_PATH = ".assistant/chat-history.json";

/** Load project-stored chats; returns null if missing or unreadable */
export async function fetchProjectChatHistory(): Promise<
  Conversation[] | null
> {
  try {
    const data = await filesApi.getContent(PROJECT_CHAT_HISTORY_PATH);
    if (typeof data.content !== "string") return null;
    const parsed = JSON.parse(data.content) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Conversation[];
  } catch {
    return null;
  }
}

/** Writes roots with `savedToProject` plus any threads whose parent chain is pinned. */
export async function persistProjectChatHistory(
  conversations: Conversation[],
): Promise<void> {
  const byId = buildConversationById(conversations);
  const payload = conversations.filter((c) => effectiveSavedToProject(c, byId));
  await filesApi.saveContent(
    PROJECT_CHAT_HISTORY_PATH,
    JSON.stringify(payload),
  );
}

export const modesApi = {
  getAll: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getModes();
    throw new Error("Electron bridge not available");
  },
};

export const projectApi = {
  current: async (): Promise<ProjectCurrentResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.current();
    throw new Error("Electron bridge not available");
  },
  reveal: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.project) return api.project.reveal();
    throw new Error("Electron bridge not available");
  },
  browse: async (): Promise<ProjectBrowseResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.browse();
    throw new Error("Electron bridge not available");
  },
  open: async (path: string): Promise<ProjectOpenResponse> => {
    const api = getElectronApi();
    if (api?.project) return api.project.open(path);
    throw new Error("Electron bridge not available");
  },
};

export const projectConfigApi = {
  status: async (): Promise<ProjectConfigStatusResponse> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.status();
    throw new Error("Electron bridge not available");
  },
  getWorkspaceMode: async (
    modeId?: string | null,
  ): Promise<WorkspaceModeSchema> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getWorkspaceMode(modeId);
    throw new Error("Electron bridge not available");
  },
  listWorkspaceModes: async (): Promise<WorkspaceModeInfo[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.listWorkspaceModes();
    throw new Error("Electron bridge not available");
  },
  getWorkspaceModesDataDir: async (): Promise<{
    path: string;
    exists: boolean;
  }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getWorkspaceModesDataDir();
    throw new Error("Electron bridge not available");
  },
  revealWorkspaceModesDataDir: async (): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig)
      return api.projectConfig.revealWorkspaceModesDataDir();
    throw new Error("Electron bridge not available");
  },
  get: async (): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.get();
    throw new Error("Electron bridge not available");
  },
  init: async (): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.init();
    throw new Error("Electron bridge not available");
  },
  initFromFile: async (): Promise<ProjectConfig | null> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.initFromFile();
    throw new Error("Electron bridge not available");
  },
  update: async (config: ProjectConfig): Promise<ProjectConfig> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.update(config);
    throw new Error("Electron bridge not available");
  },
  getModes: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getModes();
    throw new Error("Electron bridge not available");
  },
  saveMode: async (id: string, mode: Mode): Promise<Mode> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.saveMode(id, mode);
    throw new Error("Electron bridge not available");
  },
  deleteMode: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.deleteMode(id);
    throw new Error("Electron bridge not available");
  },
  resetModes: async (): Promise<Mode[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.resetModes();
    throw new Error("Electron bridge not available");
  },
  getCommentCategories: async (): Promise<CommentCategoryDef[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.getCommentCategories();
    throw new Error("Electron bridge not available");
  },
  saveCommentCategory: async (
    id: string,
    category: CommentCategoryDef,
  ): Promise<CommentCategoryDef> => {
    const api = getElectronApi();
    if (api?.projectConfig)
      return api.projectConfig.saveCommentCategory(id, category);
    throw new Error("Electron bridge not available");
  },
  deleteCommentCategory: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig)
      return api.projectConfig.deleteCommentCategory(id);
    throw new Error("Electron bridge not available");
  },
  resetCommentCategories: async (): Promise<CommentCategoryDef[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.resetCommentCategories();
    throw new Error("Electron bridge not available");
  },
  listAgents: async (): Promise<AgentPreset[]> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.listAgents();
    throw new Error("Electron bridge not available");
  },
  saveAgent: async (id: string, preset: AgentPreset): Promise<AgentPreset> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.saveAgent(id, preset);
    throw new Error("Electron bridge not available");
  },
  deleteAgent: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.projectConfig) return api.projectConfig.deleteAgent(id);
    throw new Error("Electron bridge not available");
  },
};

export interface LlmCreateRequest {
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKey: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export interface LlmUpdateRequest {
  name?: string;
  fastApiUrl?: string;
  fastModel?: string;
  fastApiKey?: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export const llmApi = {
  list: async (): Promise<LlmsListResponse> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.list();
    throw new Error("Electron bridge not available");
  },
  create: async (body: LlmCreateRequest): Promise<LlmPublic> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.create(body);
    throw new Error("Electron bridge not available");
  },
  update: async (id: string, body: LlmUpdateRequest): Promise<LlmPublic> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.update(id, body);
    throw new Error("Electron bridge not available");
  },
  remove: async (id: string): Promise<{ status: string }> => {
    const api = getElectronApi();
    if (api?.llms) return api.llms.remove(id);
    throw new Error("Electron bridge not available");
  },
};

export const wikiApi = {
  listFiles: async (): Promise<string[]> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.listFiles();
    throw new Error("Electron bridge not available");
  },
  search: async (
    q: string,
    limit?: number,
  ): Promise<Array<{ path: string; title: string; snippet: string }>> => {
    const api = getElectronApi();
    if (api?.wiki) return api.wiki.search(q, limit);
    throw new Error("Electron bridge not available");
  },
};

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export const snapshotsApi = {
  get: async (id: string): Promise<SnapshotResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.get(id);
    throw new Error("Electron bridge not available");
  },
  apply: async (id: string): Promise<SnapshotApplyResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.apply(id);
    throw new Error("Electron bridge not available");
  },
  revert: async (id: string): Promise<SnapshotRevertResponse> => {
    const api = getElectronApi();
    if (api?.snapshots) return api.snapshots.revert(id);
    throw new Error("Electron bridge not available");
  },
};

function decodeElectronStreamData(data: string): string {
  return data.replace(/\\n/g, "\n");
}

export const chatApi = {
  previewContext: async (
    body: ChatRequest,
  ): Promise<{
    includedFiles: string[];
    estimatedTokens: number;
    contextBlocks: ContextBlock[];
    systemPrompt: string;
  }> => {
    const bridge = getAppBridge();
    if (bridge?.chat) return bridge.chat.previewContext(body);
    throw new Error(
      "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.",
    );
  },

  summarizeThread: async (
    messages: ChatMessage[],
    focusInstructions?: string | null,
    parentMessages?: ChatMessage[],
  ): Promise<{ summary: string; title: string }> => {
    const focusTrimmed =
      typeof focusInstructions === "string" ? focusInstructions.trim() : "";
    const focusPayload = focusTrimmed.length > 0 ? focusTrimmed : undefined;
    console.trace(
      `[api] summarizeThread: messages=${messages.length}, parentMessages=${parentMessages?.length ?? 0}, focus=${focusPayload ? "yes" : "no (default)"}`,
    );
    const bridge = getAppBridge();
    if (bridge?.chat) {
      const out = await bridge.chat.summarizeThread({
        messages,
        focusInstructions: focusPayload,
        parentMessages,
      });
      console.trace(`[api] summarizeThread finished, summaryLength=${out.summary.length}, title="${out.title}"`);
      return out;
    }
    throw new Error(
      "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.",
    );
  },
};

/**
 * Yields one macrotask so React 18 can commit state updates between SSE tokens.
 * Without this, many `onToken` calls from a single `reader.read()` chunk are batched into one paint.
 */
function yieldMacrotaskForTokenPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Maps Main-process IPC `chat:streamEvent` payloads `{ streamId, event, data }`
 * to renderer `ChatStreamEvent` `{ type, payload }` expected by `handleStreamEvent`.
 */
function ipcChatStreamPayloadToBridgeEvent(
  raw: unknown,
): ChatStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = (r["event"] ?? r["type"]) as string | undefined;
  const data = r["data"];
  if (!type) return null;

  const stringData = typeof data === "string" ? data : null;
  const parseJson = (): unknown => {
    try {
      return typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return null;
    }
  };

  if (
    type === "token" ||
    type === "tool_call" ||
    type === "resolved_user_message"
  ) {
    return { type, payload: stringData ?? "" } as ChatStreamEvent;
  }
  if (
    type === "context" ||
    type === "tool_history" ||
    type === "done" ||
    type === "error" ||
    type === "context_update" ||
    type === "navi_state" ||
    type === "navi_tips_covered" ||
    type === "navi_step" ||
    type === "navi_facts" ||
    type === "navi_trace"
  ) {
    const payload = parseJson();
    if (payload == null) return null;
    return { type, payload } as ChatStreamEvent;
  }
  return null;
}

export function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  onContext: (info: {
    includedFiles: string[];
    estimatedTokens: number;
    maxContextTokens?: number;
  }) => void,
  onDone: (fullAssistantText: string) => void,
  onError: (err: Error) => void,
  onToolCall?: (description: string) => void,
  onContextUpdate?: (estimatedTokens: number) => void,
  onToolHistory?: (messages: import("./types.ts").ChatMessage[]) => void,
  onResolvedUserMessage?: (content: string) => void,
  onNaviState?: (stateId: string, completedStateId?: string) => void,
  onNaviTipsCovered?: (coveredIds: string[]) => void,
  onNaviStep?: (label: string | null) => void,
  onNaviFacts?: (facts: import("./types.ts").NaviFacts) => void,
  onNaviTrace?: (entry: import("./types.ts").NaviTraceEntry) => void,
): AbortController {
  const controller = new AbortController();

  const bridge = getAppBridge();
  if (bridge?.chat) {
    const chatBridge = bridge.chat;
    let errorHandled = false;
    let tokenCount = 0;
    let toolCallCount = 0;
    let activeStreamId: string | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      unsubscribe?.();
      unsubscribe = null;
      activeStreamId = null;
    };

    const handleStreamEvent = async (
      chatEvent: ChatStreamEvent,
    ): Promise<void> => {
      if (activeStreamId == null) {
        return;
      }

      if (chatEvent.type === "context") {
        onContext(chatEvent.payload);
      } else if (chatEvent.type === "error") {
        console.warn(
          "[streamChat] Received error event from Electron chat bridge:",
          chatEvent.payload.message,
        );
        onError(new Error(chatEvent.payload.message));
        errorHandled = true;
        cleanup();
      } else if (chatEvent.type === "done") {
        if (!errorHandled) {
          if (tokenCount === 0 && toolCallCount === 0) {
            console.warn(
              "[streamChat] Electron stream ended (done event) but 0 tokens were received — model returned no content.",
            );
            onError(new Error("MODEL_EMPTY_RESPONSE"));
          } else {
            onDone(chatEvent.payload.fullAssistantText);
          }
        }
        cleanup();
      } else if (chatEvent.type === "tool_call") {
        toolCallCount++;
        onToolCall?.(decodeElectronStreamData(chatEvent.payload));
      } else if (chatEvent.type === "tool_history") {
        onToolHistory?.(chatEvent.payload);
      } else if (chatEvent.type === "resolved_user_message") {
        onResolvedUserMessage?.(decodeElectronStreamData(chatEvent.payload));
      } else if (chatEvent.type === "context_update") {
        onContextUpdate?.(chatEvent.payload.estimatedTokens);
      } else if (chatEvent.type === "navi_state") {
        onNaviState?.(
          chatEvent.payload.stateId,
          chatEvent.payload.completedStateId,
        );
      } else if (chatEvent.type === "navi_tips_covered") {
        onNaviTipsCovered?.(chatEvent.payload.coveredIds);
      } else if (chatEvent.type === "navi_step") {
        onNaviStep?.(chatEvent.payload.label);
      } else if (chatEvent.type === "navi_facts") {
        onNaviFacts?.(chatEvent.payload);
      } else if (chatEvent.type === "navi_trace") {
        onNaviTrace?.(chatEvent.payload);
      } else if (chatEvent.type === "token") {
        tokenCount++;
        const unescaped = decodeElectronStreamData(chatEvent.payload);
        onToken(unescaped);
        await yieldMacrotaskForTokenPaint();
      }
    };

    void chatBridge
      .startStream(request)
      .then(({ streamId }) => {
        activeStreamId = streamId;

        const subscription = chatBridge.onStreamEvent(streamId, (payload) => {
          const evt = ipcChatStreamPayloadToBridgeEvent(payload);
          if (evt) void handleStreamEvent(evt);
        });
        unsubscribe = () => subscription.unsubscribe();

        controller.signal.addEventListener(
          "abort",
          () => {
            cleanup();
            void chatBridge.stopStream(streamId);
          },
          { once: true },
        );
      })
      .catch((err) => {
        cleanup();
        if (err instanceof Error) {
          onError(err);
          return;
        }
        onError(new Error(String(err)));
      });

    return controller;
  }

  queueMicrotask(() =>
    onError(
      new Error(
        "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann Dev neu starten.",
      ),
    ),
  );
  return controller;
}
