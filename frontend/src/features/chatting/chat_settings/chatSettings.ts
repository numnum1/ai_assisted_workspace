import type { llmInstance } from "./llmInstance";
import type { toolSettings } from "./toolSettings";

export type ChatSettings = {
    llmInstance: llmInstance,
    toolSettings: toolSettings,
    isValid: boolean
}