import type { ToolCall } from "../tool_call/tool_call.types"

export function ToolCallMessagePane ({content}: {content: ToolCall}) {
    console.log(content)
    return (<div></div>)
}