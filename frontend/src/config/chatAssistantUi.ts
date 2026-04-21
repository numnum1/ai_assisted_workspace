/**
 * How assistant text is written into the chat UI while the SSE stream is open.
 *
 * - live: update on every token (classic streaming; more re-renders).
 * - on-done: buffer tokens and replace the assistant bubble once when the stream completes.
 */
export type ChatAssistantUiMode = "live" | "on-done";

export const CHAT_ASSISTANT_UI_MODE: ChatAssistantUiMode = "live";

/**
 * In live mode, yield to the browser after every N streamed assistant tokens.
 *
 * - 1: previous behavior, yield after every token
 * - 2: roughly twice as fast visually, yield after every second token
 * - higher values: fewer forced paint opportunities, faster but less granular streaming
 */
export const CHAT_STREAM_TOKEN_YIELD_EVERY = 2;
