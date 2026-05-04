import type { ChatMessage } from "../message/chatMessage"

/**
 Represents model of either the user or the assistants or the systems turn (collection of messages/tool-calls).
 The system could be like "merges, thread splits, ..."
 */
export type ConversationTurn = {
    senderName: string,
    setSenderName: React.Dispatch<React.SetStateAction<string>>,
    messages: ChatMessage[],
    add: (message: ChatMessage) => ChatMessage,
    remove: (message: ChatMessage) => void
}