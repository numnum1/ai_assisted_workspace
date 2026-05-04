import { useMemo } from "react";
import type { Conversation } from "./conversation";
import { useArrayState } from "../../../utils/arrayTemplateHooks";
import type { ConversationTurn } from "../turn/conversationTurn";

export function useConversation () : Conversation {

    const [turns, addTurn, removeTurn] = useArrayState<ConversationTurn>([])

    const wasLastTurnFromUser = useMemo(() => {
        if (turns.length <= 0) return false
        return turns[turns.length - 1].isUser
    }, [turns])

    return {
        turns: [],
        addTurn: addTurn,
        removeTurn: removeTurn,
        isAssistantsTurn: wasLastTurnFromUser
    }
}