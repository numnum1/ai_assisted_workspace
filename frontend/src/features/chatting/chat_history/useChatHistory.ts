import type { ChatHistory } from "./chatHistory";
import type { Chat } from '../chat/chat';
import { useArrayState } from "../../../utils/arrayTemplateHooks";

export function useChatHistory () : ChatHistory {
    const [chats, addChat, removeChat] = useArrayState<Chat>([])
    return {
        chats,
        addChat,
        removeChat
    }
}