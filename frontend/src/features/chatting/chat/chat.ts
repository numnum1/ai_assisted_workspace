import type { chatSettings } from '../chat_settings/chatSettings'
import type { conversation } from '../conversation/conversation'

/**
 * Represents the model for a chat, with the settings
 */
export type Chat = {
    settings: chatSettings,
    conversation: conversation
}