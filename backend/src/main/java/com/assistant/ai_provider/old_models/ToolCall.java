package com.assistant.ai_provider.old_models;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a single tool call made by the AI, matching the OpenAI tool_calls format.
 */
@Getter
@Setter
@NoArgsConstructor
public class ToolCall {

    private String id;
    private String type = "function";
    private FunctionCall function;

    public ToolCall(String id, String functionName, String arguments) {
        this.id = id;
        this.function = new FunctionCall(functionName, arguments);
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class FunctionCall {
        private String name;
        private String arguments;

        public FunctionCall(String name, String arguments) {
            this.name = name;
            this.arguments = arguments;
        }
    }
}
