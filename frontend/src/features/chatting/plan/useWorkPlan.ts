import { useMemo, useState } from "react";
import type { WorkPlan } from "./workPlan";
import { calculateTokensFromString } from "../../../utils/contextTools";

export function useWorkPlan () : WorkPlan {

    const [title, setTitle] = useState("")
    const [content, setContent] = useState("")

    const size = useMemo(() => {
        return calculateTokensFromString(title, content)
    }, [title, content])

    return {
        name: 'Work Plan',
        icon: '📝',
        size: size,
        title: title,
        rename: setTitle,
        content: content,
        replaceContent: setContent
    }
}
