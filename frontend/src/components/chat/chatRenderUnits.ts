import type { ChatMessage } from '../../types.ts';
import type { ChangeCardData } from './ChangeCard.tsx';
import { parseWriteFileToolMessage } from './writeFileToolParse.ts';

export type ChatRenderUnit =
  | { type: 'writeFileGroup'; items: { originalIdx: number; data: ChangeCardData }[] }
  | { type: 'message'; visIdx: number; msg: ChatMessage; originalIdx: number };

/**
 * Merges consecutive {@code write_file:success} tool rows into one unit so the UI can show batch actions.
 */
export function buildChatRenderUnits(
  visible: { msg: ChatMessage; originalIdx: number }[],
): ChatRenderUnit[] {
  const out: ChatRenderUnit[] = [];
  let i = 0;
  while (i < visible.length) {
    const { msg, originalIdx } = visible[i]!;
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
    out.push({ type: 'message', visIdx: i, msg, originalIdx });
    i += 1;
  }
  return out;
}
