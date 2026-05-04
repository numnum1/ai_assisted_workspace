import type { SetStateAction } from "react"

type BaseContextBlock = {
    name: string,
    icon: string,
    size: number,
}

// TODO: Set icons

export type SystemPrompt = BaseContextBlock & {
    text: string,
    setText: React.Dispatch<SetStateAction<string>>
}

export type Glossary = BaseContextBlock & {
}

export type ChatMode = BaseContextBlock & {
}

export type ProjectFileTree = BaseContextBlock & {
}

export type ToolList = BaseContextBlock & {
}

export type WorkPlan = BaseContextBlock & {
}

export type ContextBlock =
    | SystemPrompt
    | Glossary
    | ChatMode
    | ProjectFileTree
    | ToolList
    | WorkPlan