import type {
  ChatRequest,
  LlmPublic,
  LlmsListResponse,
} from "./types.ts";
import type { ChatStreamEvent } from "./electron/bridge.ts";
import { getAppBridge } from "./electron/bridge.ts";

function getElectronApi() {
  return getAppBridge();
}

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

function decodeElectronStreamData(data: string): string {
  return data.replace(/\\n/g, "\n");
}

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
