import type { ChatMessage } from "./types.ts";
import type { ChangeCardData } from "./chatRenderUnits.ts";

export interface WriteFileBatchItem {
  originalIdx: number;
  data: ChangeCardData;
}

export function getTrailingWriteFileBatch(
  visible: { msg: ChatMessage; originalIdx: number }[],
  settled?: Record<string, "applied" | "reverted">,
): WriteFileBatchItem[] | null {
  void visible;
  void settled;
  return null;
}

export function isSameWriteFileBatch(
  a: WriteFileBatchItem[],
  b: WriteFileBatchItem[] | null,
): boolean {
  void a;
  void b;
  return false;
}
