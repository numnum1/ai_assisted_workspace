import type { ChatMessage } from "../../types.ts";
import { stripPlanFencesForDisplay } from "../../components/chat/planFenceUtils.ts";

/**
 * Canonical transform from the in-memory transcript into the history payload
 * sent to the backend. This is the single source of truth used by every chat
 * surface (main chat, Quick Chat, and the editor panels), so the wire format
 * stays identical everywhere.
 *
 * - System messages: passed through as-is.
 * - User messages: use `resolvedContent` (with injected file/context data) when
 *   present, and carry `mode`/`modeColor` when set; all other UI-only fields are
 *   stripped.
 * - Tool messages: pass through role, content and toolCallId.
 * - Assistant messages: artifact/plan fences are stripped for the model.
 */
export function buildChatHistoryPayload(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    if (msg.role === "system") {
      return { role: "system", content: msg.content };
    }
    if (msg.role === "user") {
      return {
        role: "user",
        content: msg.resolvedContent ?? msg.content,
        ...(msg.mode !== undefined && { mode: msg.mode }),
        ...(msg.modeColor !== undefined && { modeColor: msg.modeColor }),
      };
    }
    if (msg.role === "tool") {
      return {
        role: "tool",
        content: msg.content,
        toolCallId: msg.toolCallId,
      };
    }
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: stripPlanFencesForDisplay(msg.content ?? "", false),
        toolCalls: msg.toolCalls,
      };
    }
    return {
      role: msg.role,
      content: stripPlanFencesForDisplay(msg.content ?? "", false),
    };
  });
}
