import type { Message } from "../message/message.types";

export type ConversationTurnBase = {
    timestamp: number;
}

export type SystemTurn = {
    type: 'SYSTEM'
    text: string
} & ConversationTurnBase

export type AssistantTurn = {
    type: "ASSISTANT"
    usedModeName: string // Used name at the time of sending. May not exist anymore and is also not repeated with this mode
    messages: Message[]
} & ConversationTurnBase

export type UserTurn = {
    type: "USER"
    text: string
} & ConversationTurnBase

export type ConversationTurn = AssistantTurn | SystemTurn | UserTurn