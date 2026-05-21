import type { ToolCall } from "../tool_call/tool_call.types";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type MessageBase = {
}

export type TextMessage = {
    type: 'TEXT';
    text: string;
} & MessageBase

export type ThinkingMessage = {
    type: 'THINKING';
    text: string;
} & MessageBase

export type ToolCallMessage = {
    type: 'TOOL_CALL';
    content: ToolCall
} & MessageBase

export type Message = TextMessage | ToolCall | ThinkingMessage