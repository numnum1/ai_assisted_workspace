import { useMemo } from "react";
import type { Context } from "./context"
import { useSystemPrompt } from "./useSystemPrompt"

// TODO: Add the rest of the context blocks, by passing them all as parameters
export function useContext () : Context {
    
    const systemPrompt = useSystemPrompt();

    const blocks = useMemo(() => {
        return [systemPrompt]
    }, [systemPrompt])

    return {
        systemPrompt: systemPrompt,
        glossary: null,
        chatMode: null,
        projectFileTree: null,
        toolList: null,
        workPlan: null,
        blocks: blocks
    }
}