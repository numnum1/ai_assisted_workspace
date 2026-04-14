import type { ChatMessage, ToolCall } from '../../types.ts';
import type { ChangeCardData } from './ChangeCard.tsx';
import { parseWriteFileToolMessage } from './writeFileToolParse.ts';

export type ChatRenderUnit =
  | { type: 'writeFileGroup'; items: { originalIdx: number; data: ChangeCardData }[] }
  | {
      type: 'toolCall';
      assistantIdx: number;
      toolCallIdx: number;
      toolCallCount: number;
      toolCall: ToolCall;
      resultMsg?: ChatMessage;
    }
  | { type: 'message'; visIdx: number; msg: ChatMessage; originalIdx: number };

function findToolResult(
  visible: { msg: ChatMessage; originalIdx: number }[],
  assistantVisibleIndex: number,
  toolCallId: string,
): ChatMessage | undefined {
  for (let k = assistantVisibleIndex + 1; k < visible.length; k++) {
    const v = visible[k]!;
    if (v.msg.role === 'tool' && v.msg.toolCallId === toolCallId) {
      return v.msg;
    }
  }
  return undefined;
}

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

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const toolCalls = msg.toolCalls;
      const toolCallCount = toolCalls.length;

      if (msg.content?.trim()) {
        out.push({
          type: 'message',
          visIdx: i,
          msg: { ...msg, toolCalls: undefined },
          originalIdx,
        });
      }

      for (let toolCallIdx = 0; toolCallIdx < toolCallCount; toolCallIdx++) {
        const tc = toolCalls[toolCallIdx]!;
        out.push({
          type: 'toolCall',
          assistantIdx: originalIdx,
          toolCallIdx,
          toolCallCount,
          toolCall: tc,
          resultMsg: findToolResult(visible, i, tc.id),
        });
      }
      i += 1;
      continue;
    }

    out.push({ type: 'message', visIdx: i, msg, originalIdx });
    i += 1;
  }
  return out;
}
