import type { llmInstance } from "./llmInstance";
import type { toolSettings } from "./toolSettings";

export type chatSettings = {
    llmInstance: llmInstance,
    toolSettings: toolSettings
}