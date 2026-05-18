// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type MessageBase = {
}

export type TextMessage = {
    type: "TEXT"
    text: string
} & MessageBase

export type Message = TextMessage

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

export type Conversation = {
    turns: ConversationTurn[]
}

export type SelectedLLM = {
    id: string | null
    useReasoning: boolean
}

export type ChatSettings = {
    selectedModeId: string | null
    selectedLLM: SelectedLLM,
    enabledToolIds: string[],
}