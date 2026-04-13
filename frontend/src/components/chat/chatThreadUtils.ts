import type { ChatMessage } from '../../types.ts';

/** Deep-clone chat messages for a new thread (incl. toolCalls, selectionContext). */
export function cloneChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((m) => structuredClone(m) as ChatMessage);
}

/** Intro system message (Variante A): explains thread + that following messages are parent transcript. */
export function buildThreadSystemContent(parentTitle: string): string {
  const title = parentTitle.trim() || 'Haupt-Chat';
  return (
    `Du befindest dich in einem **Thread**, der vom Haupt-Chat „${title}“ abzweigt.\n\n` +
    `Die folgenden Nachrichten sind der unveränderte Verlauf dieses Chats bis einschließlich der Nachricht, ` +
    `an der der Thread gestartet wurde. Nutze sie als Hintergrund; neue Nachrichten in diesem Thread sind normaler Verlauf.`
  );
}

