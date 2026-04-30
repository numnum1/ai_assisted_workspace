import { useMemo, useState } from "react"
import type { llmApi } from "./llmApi"

export function useLLMApi () : llmApi {
    const [host, setHost] = useState("")
    const [modelName, setModelName] = useState("")
    const [apiToken, setApiToken] = useState("")
    const isValid = useMemo(() => {
        return host != "" && modelName != "" && apiToken != ""
    }, [host, modelName, apiToken])
    return {
        host, setHost, modelName, setModelName, apiToken, setApiToken, isValid
    }
}