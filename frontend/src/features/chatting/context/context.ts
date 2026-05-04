import type { ChatMode, ContextBlock, Glossary, ProjectFileTree, SystemPrompt, ToolList, WorkPlan } from "./contextBlock"

// TODO: Not all of these should be optional
export type Context = {
    systemPrompt: SystemPrompt|null,
    glossary: Glossary|null,
    chatMode: ChatMode|null,
    projectFileTree: ProjectFileTree|null,
    toolList: ToolList|null,
    workPlan: WorkPlan|null,
    blocks: ContextBlock[]
}