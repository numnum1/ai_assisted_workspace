import type { llmApi } from "./llmApi"

export type llm = {
    name: string,
    setName: React.Dispatch<React.SetStateAction<string>>,
    fastApi: llmApi,
    reasoningApi: llmApi
}