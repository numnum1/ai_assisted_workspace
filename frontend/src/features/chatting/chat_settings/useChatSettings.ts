import type { chatSettings } from "./chatSettings";
import { useLLMInstance } from "./useLLMInstance";
import { useToolSettings } from "./useToolSettings";

export function useChatSettings () : chatSettings {
    
    const llmInstance = useLLMInstance()
    const toolSettings = useToolSettings()

    return {
        llmInstance: llmInstance,
        toolSettings: toolSettings
    }
}