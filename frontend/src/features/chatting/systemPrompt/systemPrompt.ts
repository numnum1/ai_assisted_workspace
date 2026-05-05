import type { SetStateAction } from "react"
import type { BaseContextBlock } from "../context/contextBlock"

export type SystemPrompt = BaseContextBlock & {
    text: string,
    setText: React.Dispatch<SetStateAction<string>>
}