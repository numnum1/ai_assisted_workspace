import type { ChatMessage, ChatRequest } from "../../types.ts";
import type {
  ChatContextInfo,
  ChatStreamEvent,
} from "../../electron/bridge.ts";
import { getAppBridge } from "../../electron/bridge.ts";

/**
 * Low-level streaming transport for the assistant.
 *
 * This is the ONE place the SSE/IPC chat stream lifecycle lives: starting a
 * stream over the Electron bridge, mapping raw IPC payloads into typed
 * {@link ChatStreamEvent}s, and driving a typed set of {@link AiStreamHandlers}.
 * Everything above it (React hooks, UI) talks to {@link startChatStream} and
 * never touches the bridge or the wire format directly.
 */

/** Message shown when the Electron preload chat bridge is unavailable. */
const CHAT_BRIDGE_MISSING_MESSAGE =
  "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann Dev neu starten.";

/**
 * Typed callbacks for a single chat stream. Replaces the previous nine
 * positional callback arguments — grouping them makes call sites self-documenting
 * and removes the risk of passing handlers in the wrong order.
 */
export interface AiStreamHandlers {
  /** A text token was produced by the model. */
  onToken: (token: string) => void;
  /** Initial context info (included files, token estimate) for the request. */
  onContext: (info: ChatContextInfo) => void;
  /** Stream finished successfully; receives the full assistant text. */
  onDone: (fullAssistantText: string) => void;
  /** Stream failed (or the model returned nothing). */
  onError: (err: Error) => void;
  /** A tool call is running; receives a human-readable description. */
  onToolCall?: (description: string) => void;
  /** Updated running token estimate as tools add context. */
  onContextUpdate?: (estimatedTokens: number) => void;
  /** Tool-round messages to fold into the transcript (assistant + tool rows). */
  onToolHistory?: (messages: ChatMessage[]) => void;
  /** The user message as the server resolved it (with injected context). */
  onResolvedUserMessage?: (content: string) => void;
}

/** Electron streams escape newlines; undo that for display/state. */
function decodeElectronStreamData(data: string): string {
  return data.replace(/\\n/g, "\n");
}

/**
 * Yields one macrotask so React 18 can commit state updates between SSE tokens.
 * Without this, many `onToken` calls from a single `reader.read()` chunk are
 * batched into one paint.
 */
function yieldMacrotaskForTokenPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Maps Main-process IPC `chat:streamEvent` payloads `{ streamId, event, data }`
 * to renderer {@link ChatStreamEvent} `{ type, payload }`.
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
    type === "context_update"
  ) {
    const payload = parseJson();
    if (payload == null) return null;
    return { type, payload } as ChatStreamEvent;
  }
  return null;
}

/**
 * Starts a chat stream and drives {@link AiStreamHandlers} until it completes,
 * errors, or is aborted via the returned {@link AbortController}.
 *
 * Behaviour notes preserved from the original implementation:
 * - If the stream ends with zero tokens and zero tool calls, `onError` is called
 *   with `MODEL_EMPTY_RESPONSE` instead of `onDone` (the model said nothing).
 * - Aborting stops the underlying bridge stream and unsubscribes listeners.
 */
export function startChatStream(
  request: ChatRequest,
  handlers: AiStreamHandlers,
): AbortController {
  const controller = new AbortController();

  const bridge = getAppBridge();
  if (!bridge?.chat) {
    queueMicrotask(() =>
      handlers.onError(new Error(CHAT_BRIDGE_MISSING_MESSAGE)),
    );
    return controller;
  }

  console.info(
    `[ai/ui] startChatStream: llmId=${
      request.llmId ? `"${request.llmId}"` : "(none → main process auto-selects a provider)"
    } mode="${request.mode}" useReasoning=${request.useReasoning === true} ` +
      `effort=${request.reasoningEffort ?? "(none)"} quickChat=${request.quickChat === true} ` +
      `history=${request.history?.length ?? 0} referencedFiles=${request.referencedFiles?.length ?? 0}`,
  );

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
      handlers.onContext(chatEvent.payload);
    } else if (chatEvent.type === "error") {
      console.warn(
        "[startChatStream] Received error event from Electron chat bridge:",
        chatEvent.payload.message,
      );
      handlers.onError(new Error(chatEvent.payload.message));
      errorHandled = true;
      cleanup();
    } else if (chatEvent.type === "done") {
      if (!errorHandled) {
        if (tokenCount === 0 && toolCallCount === 0) {
          console.warn(
            "[startChatStream] Electron stream ended (done event) but 0 tokens were received — model returned no content.",
          );
          handlers.onError(new Error("MODEL_EMPTY_RESPONSE"));
        } else {
          handlers.onDone(chatEvent.payload.fullAssistantText);
        }
      }
      cleanup();
    } else if (chatEvent.type === "tool_call") {
      toolCallCount++;
      handlers.onToolCall?.(decodeElectronStreamData(chatEvent.payload));
    } else if (chatEvent.type === "tool_history") {
      handlers.onToolHistory?.(chatEvent.payload);
    } else if (chatEvent.type === "resolved_user_message") {
      handlers.onResolvedUserMessage?.(
        decodeElectronStreamData(chatEvent.payload),
      );
    } else if (chatEvent.type === "context_update") {
      handlers.onContextUpdate?.(chatEvent.payload.estimatedTokens);
    } else if (chatEvent.type === "token") {
      tokenCount++;
      const unescaped = decodeElectronStreamData(chatEvent.payload);
      handlers.onToken(unescaped);
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
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    });

  return controller;
}
