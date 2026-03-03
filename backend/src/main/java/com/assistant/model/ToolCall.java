package com.assistant.model;

/**
 * Represents a single tool call made by the AI, matching the OpenAI tool_calls format.
 */
public class ToolCall {

    private String id;
    private String type = "function";
    private FunctionCall function;

    public ToolCall() {}

    public ToolCall(String id, String functionName, String arguments) {
        this.id = id;
        this.function = new FunctionCall(functionName, arguments);
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public FunctionCall getFunction() { return function; }
    public void setFunction(FunctionCall function) { this.function = function; }

    public static class FunctionCall {
        private String name;
        private String arguments;

        public FunctionCall() {}

        public FunctionCall(String name, String arguments) {
            this.name = name;
            this.arguments = arguments;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getArguments() { return arguments; }
        public void setArguments(String arguments) { this.arguments = arguments; }
    }
}
