import type { ChatSettings } from "./chatSettings";
import { useLLMInstance } from "./useLLMInstance";
import { useToolSettings } from "./useToolSettings";

export function useChatSettings () : ChatSettings {
    
    const llmInstance = useLLMInstance()
    const toolSettings = useToolSettings()

    const isValid = false; // TODO: Implement

    return {
        llmInstance: llmInstance,
        toolSettings: toolSettings,
        isValid: isValid
    }
}