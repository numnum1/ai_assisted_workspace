import type { conversation } from "./conversation";

export function useConversation () : conversation {
    return {
        turns: []
    }
}