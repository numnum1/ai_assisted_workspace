import { useMemo, useState } from "react";
import type { SystemPrompt } from "./contextBlock";

export function useSystemPrompt () : SystemPrompt {

    const [text, setText] = useState("")
    // Actual calculation of token length
    const size = useMemo(() => {
        return text.length
    }, [text])

    return {
        name: "System Prompt",
        icon: "Set Icon Here", //TODO: Find icon name
        size: size,
        text: text,
        setText: setText
    }
}