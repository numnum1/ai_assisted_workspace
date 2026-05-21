import type { ToolkitId } from "../tools/toolkit"

export type SelectedLLM = {
    id: string | null
    useReasoning: boolean
}

export type ChatSettings = {
    selectedModeId: string | null
    selectedLLM: SelectedLLM,
    enabledToolkitIds: ToolkitId[],
}