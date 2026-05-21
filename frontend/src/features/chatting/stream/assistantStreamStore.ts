import type { Message } from "../message/message.types";

const content = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

export function getStreamingText(chatId: string): string {
  return content.get(chatId) ?? "";
}

export function writeStreamingText(chatId: string, text: string | null): void {
  if (text === null) {
    content.delete(chatId);
  } else {
    content.set(chatId, text);
  }
  listeners.get(chatId)?.forEach((l) => l());
}

export function subscribeStreamingText(chatId: string, listener: () => void): () => void {
  if (!listeners.has(chatId)) listeners.set(chatId, new Set());
  listeners.get(chatId)!.add(listener);
  return () => listeners.get(chatId)!.delete(listener);
}

/** Strips any partial opening/closing tag suffix that might be split across tokens. */
function trimPartialTag(text: string): string {
  const tags = ["<think>", "</think>"];
  for (const tag of tags) {
    for (let i = 1; i < tag.length; i++) {
      if (text.endsWith(tag.slice(0, i))) {
        return text.slice(0, text.length - i);
      }
    }
  }
  return text;
}

/**
 * Parses accumulated raw stream text into typed Message objects.
 * Handles complete <think>...</think> blocks and in-progress unclosed blocks.
 */
export function parseStreamMessages(rawText: string): Message[] {
  const messages: Message[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const before = rawText.slice(lastIdx, match.index);
    if (before) messages.push({ type: "TEXT", text: before });
    if (match[1]) messages.push({ type: "THINKING", text: match[1] });
    lastIdx = match.index + match[0].length;
  }

  const remaining = rawText.slice(lastIdx);
  const openIdx = remaining.indexOf("<think>");

  if (openIdx === -1) {
    // No unclosed thinking block — strip any partial tag at the very end
    const trimmed = trimPartialTag(remaining);
    if (trimmed) messages.push({ type: "TEXT", text: trimmed });
  } else {
    // Thinking block is open but not yet closed
    const before = remaining.slice(0, openIdx);
    if (before) messages.push({ type: "TEXT", text: before });
    const thinking = remaining.slice(openIdx + "<think>".length);
    if (thinking) messages.push({ type: "THINKING", text: thinking });
  }

  return messages.length > 0 ? messages : [{ type: "TEXT", text: rawText }];
}
