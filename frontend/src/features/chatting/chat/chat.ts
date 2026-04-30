import type { chatSettings } from '../chat_settings/chatSettings'
import type { conversation } from '../conversation/conversation'

/**
 * Represents the model for a chat, with the settings
 */
export type chat = {
    settings: chatSettings,
    conversation: conversation
}