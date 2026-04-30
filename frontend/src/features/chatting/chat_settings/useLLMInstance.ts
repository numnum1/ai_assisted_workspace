import { useState } from "react";
import { useLLM } from "../llm/useLLM";
import type { llmInstance } from "./llmInstance";

export function useLLMInstance () : llmInstance {

    const llm = useLLM()
    const [wantsToUseReasoning, setWantsToUseReasoning] = useState(false)

    return {
        llm,
        wantsToUseReasoning,
        setWantsToUseReasoning
    }
}