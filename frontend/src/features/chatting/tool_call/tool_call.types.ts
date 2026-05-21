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
}

export type ToolCall = MultipleChoiceToolCall