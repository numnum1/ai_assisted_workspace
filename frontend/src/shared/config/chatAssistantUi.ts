/**
 * How assistant text is written into the chat UI while the SSE stream is open.
 *
 * - live: update on every token (classic streaming; more re-renders).
 * - on-done: buffer tokens and replace the assistant bubble once when the stream completes.
 */
export type ChatAssistantUiMode = 'live' | 'on-done';

export const CHAT_ASSISTANT_UI_MODE: ChatAssistantUiMode = 'live';
