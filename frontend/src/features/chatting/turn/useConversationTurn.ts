import { useState } from "react"
import type { ConversationTurn } from "./conversationTurn"
import type { ChatMessage } from "../message/chatMessage"
import { useArrayState } from "../../../utils/arrayTemplateHooks"

export function useConversationTurn () : ConversationTurn {

    const [senderName, setSenderName] = useState("")
    const [messages, addMessage, removeMessage] = useArrayState<ChatMessage>([])

    return {
        senderName,
        setSenderName,
        messages,
        addMessage,
        removeMessage
    }
}