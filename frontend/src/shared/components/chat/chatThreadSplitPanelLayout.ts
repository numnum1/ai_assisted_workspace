import type { Layout } from "react-resizable-panels";

export const CHAT_THREAD_SPLIT_LAYOUT_KEY =
  "assistant-chat-thread-split-layout";

export const CHAT_THREAD_SPLIT_PANEL_IDS = [
  "chat-thread-split-picker",
  "chat-thread-split-left",
  "chat-thread-split-right",
] as const;

export function loadChatThreadSplitLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(CHAT_THREAD_SPLIT_LAYOUT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    const rec = parsed as Record<string, unknown>;
    const layout: Layout = {};
    for (const id of CHAT_THREAD_SPLIT_PANEL_IDS) {
      const v = rec[id];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return undefined;
      }
      layout[id] = v;
    }
    const sum = CHAT_THREAD_SPLIT_PANEL_IDS.reduce(
      (acc, id) => acc + layout[id],
      0,
    );
    if (sum < 99 || sum > 101) return undefined;
    return layout;
  } catch {
    return undefined;
  }
}

export function saveChatThreadSplitLayout(layout: Layout): void {
  try {
    const payload: Layout = {};
    for (const id of CHAT_THREAD_SPLIT_PANEL_IDS) {
      const v = layout[id];
      if (typeof v !== "number" || !Number.isFinite(v)) return;
      payload[id] = v;
    }
    localStorage.setItem(
      CHAT_THREAD_SPLIT_LAYOUT_KEY,
      JSON.stringify(payload),
    );
  } catch {
    /* ignore */
  }
}
