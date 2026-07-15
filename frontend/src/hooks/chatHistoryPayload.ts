/**
 * Back-compat shim. The history-payload builder now lives in the AI service
 * layer as {@link buildChatHistoryPayload}; this re-export keeps existing
 * importers (e.g. context preview) working under the old name.
 */
export { buildChatHistoryPayload as buildHistoryPayload } from '../services/ai/chatHistory.ts';
