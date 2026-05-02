import type { chat } from "../chat/chat"

/**
 * Hold the list of all existing chats
 */
export type ChatHistory = {
  chats: chat[],
  add: (chat: chat) => chat,
  remove: (chat: chat) => void
}