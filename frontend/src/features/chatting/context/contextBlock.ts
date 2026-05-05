import type { WorkPlan } from "../plan/workPlan"
import type { SystemPrompt } from "../systemPrompt/systemPrompt"

export type BaseContextBlock = {
    name: string,
    icon: string,
    size: number,
}

// TODO: Set icons

export type Glossary = BaseContextBlock & {
}

export type ChatMode = BaseContextBlock & {
}

export type ProjectFileTree = BaseContextBlock & {
}

export type ToolList = BaseContextBlock & {
}

export type ContextBlock =
    | SystemPrompt
    | Glossary
    | ChatMode
    | ProjectFileTree
    | ToolList
    | WorkPlan