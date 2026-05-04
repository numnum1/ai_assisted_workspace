import { useCallback, useState } from "react"
import type { ConversationTurn } from "./conversationTurn"
import type { ChatMessage } from "../message/chatMessage"
import { makeAdd, makeRemove } from "../../../utils/templateFunctions"

export function useConversationTurn () : ConversationTurn {

    const [senderName, setSenderName] = useState("")
    const [messages, setMessages] = useState<ChatMessage[]>([])


    const add = makeAdd(messages, setMessages);
    const remove = makeRemove(messages, setMessages)

    return {
        senderName,
        setSenderName,
        messages,
        add,
        remove
    }
}