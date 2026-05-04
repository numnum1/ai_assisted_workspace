import type { ConversationTurn } from '../turn/conversationTurn';

/**
 * Represents the model for a conversation (messages)
 */
export type Conversation = {
    turns: ConversationTurn[],
    addTurn: (turn: ConversationTurn) => void,
    removeTurn: (predicate: (entry: ConversationTurn) => boolean) => void,
    isAssistantsTurn: boolean
}