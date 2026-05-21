// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ToolCallBase = {
}

export type MultipleChoiceOption = {
    name: string;
    value: string;
    isSelected: boolean;
}

export type MultipleChoiceToolCall = {
    type: 'MULTIPLE_CHOICE'
    question: string;
    options: MultipleChoiceOption[]
    hasUserInputOption: boolean;
    userInputOptionText: string;
} & ToolCallBase

/** LLM function call (from the assistant tool-use loop). */
export type FunctionCallToolCall = {
    type: 'FUNCTION_CALL';
    id: string;
    name: string;
    arguments: string;
    result?: string;
} & ToolCallBase

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type UnknownToolCall = {
} & ToolCallBase

export type ToolCall = MultipleChoiceToolCall | FunctionCallToolCall | UnknownToolCall