import { useChatSettings } from "../chat_settings/useChatSettings";
import type { chat } from "./chat";
import { useConversation } from "../conversation/useConversation";

export function useChat () : chat {
    
    const settings = useChatSettings()
    const conversation = useConversation()

    return {
        settings, conversation
    }
}