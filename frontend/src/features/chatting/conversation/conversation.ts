import type { ConversationTurn } from "../turn/conversation_turn";

/**
 * Represents the model for a conversation (messages)
 */
export type conversation = {
    turns: ConversationTurn[],
}