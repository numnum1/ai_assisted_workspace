import type { ChatMessage } from '../../types.ts';
import type { ChangeCardData } from './ChangeCard.tsx';
import { parseWriteFileToolMessage } from './writeFileToolParse.ts';

export interface WriteFileBatchItem {
  originalIdx: number;
  data: ChangeCardData;
}

/**
 * Consecutive {@code write_file:success} tool messages at the **end** of the visible list
 * (e.g. latest multi-file write before the user sends another message).
 */
export function getTrailingWriteFileBatch(
  visible: { msg: ChatMessage; originalIdx: number }[],
): WriteFileBatchItem[] | null {
  const items: WriteFileBatchItem[] = [];
  for (let i = visible.length - 1; i >= 0; i--) {
    const { msg, originalIdx } = visible[i]!;
    const data = msg.role === 'tool' ? parseWriteFileToolMessage(msg.content) : null;
    if (!data) break;
    items.push({ originalIdx, data });
  }
  if (items.length < 2) return null;
  items.reverse();
  return items;
}

export function isSameWriteFileBatch(
  a: WriteFileBatchItem[],
  b: WriteFileBatchItem[] | null,
): boolean {
  if (!b || a.length !== b.length) return false;
  return a.every((x, i) => x.data.snapshotId === b[i]!.data.snapshotId);
}

/** Every {@code write_file:success} tool row in visible order (for composer bulk actions). */
export function collectAllWriteFileItems(
  visible: { msg: ChatMessage; originalIdx: number }[],
): WriteFileBatchItem[] {
  const out: WriteFileBatchItem[] = [];
  for (const { msg, originalIdx } of visible) {
    if (msg.role !== 'tool') continue;
    const data = parseWriteFileToolMessage(msg.content);
    if (data) out.push({ originalIdx, data });
  }
  return out;
}
