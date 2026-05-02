import { useCallback, useState } from "react";
import type { ChatHistory } from "./chatHistory";
import type { chat } from '../chat/chat';

export function useChatHistory () : ChatHistory {
    
    const [chats, setChats] = useState<chat[]>([])

    const add = useCallback((chat: chat) => {
        setChats(chats.concat([chat]))
        return chat
    }, [chats])
    const remove = useCallback((chat: chat) => {
        setChats(chats.filter((t) => {
            return t != chat
        }))
        return chat
    }, [chats])

    return {
        chats,
        add,
        remove
    }
}