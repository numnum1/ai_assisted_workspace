import { useState } from "react";
import type { llm } from "./llm";
import { useLLMApi } from "./useLLMApi";

export function useLLM () : llm {
    
    const [name, setName] = useState("")
    const fastApi = useLLMApi()
    const reasoningApi = useLLMApi()

    return {
        name: name, 
        setName: setName,
        fastApi: fastApi,
        reasoningApi: reasoningApi
    }
}