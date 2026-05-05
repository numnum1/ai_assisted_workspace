import { useMemo, useState } from "react";
import type { SystemPrompt } from "./systemPrompt";
import { calculateTokensFromString } from "../../../utils/contextTools";

export function SystemPrompt () : SystemPrompt {

    const [text, setText] = useState('')

    const size = useMemo(() => {
        return calculateTokensFromString(text)
    }, [text])

    return {
        name: 'System Prompt',
        icon: '⚙️',
        size: size,
        text: text,
        setText: setText
    }
}