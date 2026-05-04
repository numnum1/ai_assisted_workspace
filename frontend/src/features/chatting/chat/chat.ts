import type { SetStateAction } from 'react'
import type { ChatSettings } from '../chat_settings/chatSettings'
import type { Conversation } from '../conversation/conversation'
import type { StreamingResult } from '../streaming/streamingResult'

/**
 * Represents the model for a chat, with the settings
 */
export type Chat = {
    settings: ChatSettings,
    conversation: Conversation,
    userText: string,
    setUserText: React.Dispatch<SetStateAction<string>>,
    name: string,
    rename: React.Dispatch<SetStateAction<string>>,
    isStreaming: boolean,
    send: () => void,
    canSend: boolean,
    interrupt: () => void,
    streamingResult: StreamingResult | null
}