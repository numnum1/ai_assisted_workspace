import type { ChatMessage } from "../../types.ts";
import { getAppBridge } from "../../electron/bridge.ts";
import { startChatStream } from "./aiStreamTransport.ts";

/**
 * The single facade for the app's general AI operations.
 *
 * Every non-domain-specific model call goes through here, so there is one clear
 * place that owns "talking to the assistant": streaming chat and thread
 * summarisation. UI code and hooks depend on this facade rather than reaching
 * into the Electron bridge directly.
 *
 * (Domain-specific AI features that belong to a single view — chapter comment
 * generation, typed-file autofill — stay with their domain APIs in `api.ts`.
 * The context-preview path is intentionally not part of this facade.)
 */

/** Raised when the Electron preload chat bridge is unavailable. */
const CHAT_BRIDGE_MISSING_MESSAGE =
  "Chat (Preload) fehlt. Im Ordner frontend: `npm run build:electron`, dann `npm run dev:electron` neu starten.";

export interface SummarizeThreadInput {
  messages: ChatMessage[];
  /** Optional focus for the summary; blank/whitespace is treated as "default". */
  focusInstructions?: string | null;
  /** Parent-conversation messages for additional context, if any. */
  parentMessages?: ChatMessage[];
}

export interface SummarizeThreadResult {
  summary: string;
  title: string;
}

/**
 * Summarises a chat thread into `{ summary, title }` via the model, e.g. to merge
 * a side thread back into its parent conversation.
 */
async function summarizeThread(
  input: SummarizeThreadInput,
): Promise<SummarizeThreadResult> {
  const focusTrimmed =
    typeof input.focusInstructions === "string"
      ? input.focusInstructions.trim()
      : "";
  const focusPayload = focusTrimmed.length > 0 ? focusTrimmed : undefined;

  const bridge = getAppBridge();
  if (!bridge?.chat) {
    throw new Error(CHAT_BRIDGE_MISSING_MESSAGE);
  }
  return bridge.chat.summarizeThread({
    messages: input.messages,
    focusInstructions: focusPayload,
    parentMessages: input.parentMessages,
  });
}

export const aiService = {
  /** Start a streaming assistant turn. See {@link startChatStream}. */
  startChatStream,
  summarizeThread,
};

export type { AiStreamHandlers } from "./aiStreamTransport.ts";
export { startChatStream } from "./aiStreamTransport.ts";
export { buildChatHistoryPayload } from "./chatHistory.ts";
