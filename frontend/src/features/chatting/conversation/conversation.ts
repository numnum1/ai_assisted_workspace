import type { ConversationTurn } from "../turn/conversationTurn";

/**
 * Represents the model for a conversation (messages)
 */
export type conversation = {
    turns: ConversationTurn[],
}