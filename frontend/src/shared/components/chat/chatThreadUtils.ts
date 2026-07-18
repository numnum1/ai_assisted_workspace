import type { ChatMessage } from "../../types.ts";

/** Deep-clone chat messages for a new thread (incl. toolCalls, selectionContext). */
export function cloneChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((m) => structuredClone(m) as ChatMessage);
}

/** Intro system message: explains thread + that messages are parent transcript for context. */
export function buildThreadSystemContent(parentTitle: string): string {
  const title = parentTitle.trim() || "Haupt-Chat";
  return (
    `Du befindest dich in einem **Thread**, der vom Haupt-Chat „${title}“ abzweigt.\n\n` +
    `Die folgenden Nachrichten zeigen den Verlauf des Haupt-Chats bis einschließlich der Nachricht, ` +
    `an der dieser Thread gestartet wurde. Diese Nachrichten dienen als **Kontext** für die neue Diskussion. ` +
    `Die **letzte sichtbare Nachricht** zeigt, wo der Thread beginnt. Ab hier werden neue Themen behandelt.`
  );
}

/** Hidden system intro + parent transcript through `messageIndex` (inclusive) for a new thread.
 * Note: The last message (at `messageIndex`) is kept VISIBLE so users can see where the thread starts.
 */
export function buildThreadHiddenBootstrap(
  parentDisplayTitle: string,
  chatMessages: ChatMessage[],
  messageIndex: number,
): ChatMessage[] {
  const transcript = cloneChatMessages(chatMessages.slice(0, messageIndex + 1));
  const systemIntro: ChatMessage = {
    role: "system",
    content: buildThreadSystemContent(parentDisplayTitle),
    hidden: true,
  };
  // Hide all messages except the last one (which shows the thread starting point)
  return [
    systemIntro,
    ...transcript.map((m, idx) => ({
      ...m,
      hidden: idx < transcript.length - 1, // Only hide if not the last message
    })),
  ];
}
