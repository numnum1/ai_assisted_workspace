import type { ChatMessage } from '../types.ts';

/**
 * Transforms the messages array into the history payload sent to the backend.
 * - User messages: uses resolvedContent (with file data) if available, strips UI-only fields
 * - Tool/hidden messages: passes through role, content, toolCalls, toolCallId
 * - Assistant messages: passes through role and content (and selectionContext stripped)
 */
export function buildHistoryPayload(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.resolvedContent ?? msg.content,
        ...(msg.mode !== undefined && { mode: msg.mode }),
        ...(msg.modeColor !== undefined && { modeColor: msg.modeColor }),
      };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
      };
    }
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content,
        toolCalls: msg.toolCalls,
      };
    }
    return { role: msg.role, content: msg.content };
  });
}
