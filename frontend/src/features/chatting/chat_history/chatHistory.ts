import type { Chat } from "../chat/chat"

/**
 * Hold the list of all existing chats
 */
export type ChatHistory = {
  chats: Chat[],
  addChat: (chat: Chat) => void,
  removeChat: (predicate: (entry: Chat) => boolean) => void
}