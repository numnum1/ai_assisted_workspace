/**
 Represents model of either the user or the assistants or the systems turn (collection of messages/tool-calls).
 The system could be like "merges, thread splits, ..."
 */
export type ConversationTurn = {
    placeholder: string
}