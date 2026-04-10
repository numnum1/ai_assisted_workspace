import type { ChatMessage } from '../../types.ts';
import type { ChangeCardData } from './ChangeCard.tsx';
import { parseWriteFileToolMessage } from './writeFileToolParse.ts';

export type ChatRenderUnit =
  | { type: 'writeFileGroup'; items: { originalIdx: number; data: ChangeCardData }[] }
  | { type: 'toolCall'; assistantIdx: number; toolCallIdx: number; toolCall: any; resultMsg?: ChatMessage }
  | { type: 'message'; visIdx: number; msg: ChatMessage; originalIdx: number };

/**
 * Builds render units for the chat. Special handling for:
 * - write_file success batches (ChangeCardGroup)
 * - assistant messages with toolCalls (ToolCallDisplay units)
 * - normal messages
 */
export function buildChatRenderUnits(
  visible: { msg: ChatMessage; originalIdx: number }[],
): ChatRenderUnit[] {
  const out: ChatRenderUnit[] = [];
  let i = 0;
  while (i < visible.length) {
    const { msg, originalIdx } = visible[i]!;

    // Special case: write_file success messages → grouped cards
    const data = msg.role === 'tool' ? parseWriteFileToolMessage(msg.content) : null;
    if (data) {
      const items: { originalIdx: number; data: ChangeCardData }[] = [];
      let j = i;
      while (j < visible.length) {
        const v = visible[j]!;
        const d = v.msg.role === 'tool' ? parseWriteFileToolMessage(v.msg.content) : null;
        if (!d) break;
        items.push({ originalIdx: v.originalIdx, data: d });
        j++;
      }
      out.push({ type: 'writeFileGroup', items });
      i = j;
      continue;
    }

    // New: assistant message with toolCalls → create ToolCallDisplay units
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      msg.toolCalls.forEach((tc, toolCallIdx) => {
        // Look for matching tool result message immediately after this assistant message
        let resultMsg: ChatMessage | undefined = undefined;
        const next = visible[i + 1];
        if (next && next.msg.role === 'tool' && next.msg.toolCallId === tc.id) {
          resultMsg = next.msg;
        }
        out.push({
          type: 'toolCall',
          assistantIdx: originalIdx,
          toolCallIdx,
          toolCall: tc,
          resultMsg,
        });
      });
      i += 1;
      continue;
    }

    out.push({ type: 'message', visIdx: i, msg, originalIdx });
    i += 1;
  }
  return out;
}
