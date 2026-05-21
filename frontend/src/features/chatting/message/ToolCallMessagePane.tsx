import type { ToolCall } from '../conversation/types';

export function ToolCallMessagePane ({content}: {content: ToolCall}) {
    console.log(content)
    return (<div></div>)
}