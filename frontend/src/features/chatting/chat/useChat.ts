import { useChatSettings } from "../chat_settings/useChatSettings";
import type { Chat } from "./chat";
import { useConversation } from "../conversation/useConversation";

export function useChat () : Chat {
    
    const settings = useChatSettings()
    const conversation = useConversation()

    return {
        settings, conversation
    }
}