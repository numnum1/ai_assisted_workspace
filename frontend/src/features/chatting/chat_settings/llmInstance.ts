import type { SetStateAction } from "react"
import type { llm } from "../llm/llm"

// Example: Grok + Reasoning
export type llmInstance = {
    llm: llm,
    wantsToUseReasoning: boolean,
    setWantsToUseReasoning: React.Dispatch<SetStateAction<boolean>>
}