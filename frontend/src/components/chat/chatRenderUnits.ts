import type { ChatMessage, ToolCall } from '../../types.ts';

/** Pre-tool assistant deltas like "## " stream as non-blank but render as empty markdown headings. */
function isHeadingOnlyPreToolText(trimmed: string): boolean {
  return /^#{1,6}\s*$/.test(trimmed);
}

export type SubRenderUnit =
  | {
      type: 'toolCall';
      assistantIdx: number;
      toolCallIdx: number;
      toolCallCount: number;
      toolCall: ToolCall;
      resultMsg?: ChatMessage;
    }
  | { type: 'assistantText'; visIdx: number; msg: ChatMessage; originalIdx: number }
  | { type: 'toolMessage'; visIdx: number; msg: ChatMessage; originalIdx: number };

export type ChatRenderUnit =
  | {
      type: 'assistantTurn';
      originalIndices: number[];
      lastOriginalIdx: number;
      firstVisIdx: number;
      subUnits: SubRenderUnit[];
    }
  | {
      type: 'userTurn';
      /** All messages belonging to this turn (visible user messages sharing the same turnId). */
      messages: { msg: ChatMessage; visIdx: number; originalIdx: number }[];
      originalIndices: number[];
      lastOriginalIdx: number;
      firstVisIdx: number;
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

/** Tool rows whose content is shown inside {@link ToolCallDisplay} for a preceding assistant message. */
function isToolResultRenderedInline(
  visible: { msg: ChatMessage; originalIdx: number }[],
  toolVisibleIndex: number,
): boolean {
  const msg = visible[toolVisibleIndex]!.msg;
  if (msg.role !== 'tool' || !msg.toolCallId) return false;
  for (let t = toolVisibleIndex - 1; t >= 0; t--) {
    const m = visible[t]!.msg;
    if (m.role === 'assistant' && m.toolCalls?.some((tc) => tc.id === msg.toolCallId)) {
      return true;
    }
    if (m.role === 'user' || m.role === 'system') return false;
  }
  return false;
}

/**
 * Builds sub-units for one assistant/tool turn (visible indices [start, end)).
 */
function buildTurnSubUnits(
  visible: { msg: ChatMessage; originalIdx: number }[],
  start: number,
  end: number,
): SubRenderUnit[] {
  const out: SubRenderUnit[] = [];
  let i = start;
  while (i < end) {
    const { msg, originalIdx } = visible[i]!;

    if (msg.role === 'tool' && isToolResultRenderedInline(visible, i)) {
      i += 1;
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const toolCalls = msg.toolCalls;
      const toolCallCount = toolCalls.length;

      const preToolText = msg.content?.trim() ?? '';
      if (preToolText && !isHeadingOnlyPreToolText(preToolText)) {
        out.push({
          type: 'assistantText',
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

    if (msg.role === 'assistant') {
      out.push({ type: 'assistantText', visIdx: i, msg, originalIdx });
      i += 1;
      continue;
    }

    out.push({ type: 'toolMessage', visIdx: i, msg, originalIdx });
    i += 1;
  }
  return out;
}

/**
 * Builds render units for the chat. User/system messages are single units; each consecutive
 * assistant+tool block is one {@link assistantTurn} with sub-units (write_file batches, tool calls, text).
 */
export function buildChatRenderUnits(
  visible: { msg: ChatMessage; originalIdx: number }[],
): ChatRenderUnit[] {
  const out: ChatRenderUnit[] = [];
  let i = 0;
  while (i < visible.length) {
    const { msg, originalIdx } = visible[i]!;
    const role = msg.role;

    if (role === 'system') {
      out.push({ type: 'message', visIdx: i, msg, originalIdx });
      i += 1;
      continue;
    }

    if (role === 'user') {
      // Collect all consecutive user messages that share the same turnId (or just this one).
      const tid = msg.turnId;
      const items: { msg: ChatMessage; visIdx: number; originalIdx: number }[] = [
        { msg, visIdx: i, originalIdx },
      ];
      if (tid !== undefined) {
        let j = i + 1;
        while (j < visible.length && visible[j]!.msg.role === 'user' && visible[j]!.msg.turnId === tid) {
          items.push({ msg: visible[j]!.msg, visIdx: j, originalIdx: visible[j]!.originalIdx });
          j++;
        }
      }
      const originalIndices = items.map((it) => it.originalIdx);
      out.push({
        type: 'userTurn',
        messages: items,
        originalIndices,
        lastOriginalIdx: originalIndices[originalIndices.length - 1]!,
        firstVisIdx: i,
      });
      i += items.length;
      continue;
    }

    const start = i;
    let j = i;
    while (j < visible.length) {
      const r = visible[j]!.msg.role;
      if (r === 'user' || r === 'system') break;
      j += 1;
    }

    const slice = visible.slice(start, j);
    const originalIndices = slice.map((v) => v.originalIdx);
    const lastOriginalIdx = originalIndices[originalIndices.length - 1]!;
    const subUnits = buildTurnSubUnits(visible, start, j);

    out.push({
      type: 'assistantTurn',
      originalIndices,
      lastOriginalIdx,
      firstVisIdx: start,
      subUnits,
    });
    i = j;
  }
  return out;
}

/** Whether a tool row's result is already shown inside a {@link ToolCallDisplay} in an assistant turn. */
export function toolResultShownInAssistantTurns(
  units: ChatRenderUnit[],
  toolCallId: string | undefined,
): boolean {
  if (!toolCallId) return false;
  for (const u of units) {
    if (u.type !== 'assistantTurn') continue;
    for (const s of u.subUnits) {
      if (s.type === 'toolCall' && s.resultMsg?.toolCallId === toolCallId) {
        return true;
      }
    }
  }
  return false;
}
