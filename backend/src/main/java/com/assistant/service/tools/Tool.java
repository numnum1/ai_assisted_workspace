package com.assistant.service.tools;

import java.util.Map;

/**
 * Represents a single AI tool that can be called by the language model.
 * Implement this interface and annotate with {@code @Component} to register
 * the tool automatically — no changes to ToolExecutor needed.
 */
public interface Tool {

    /** Unique name used in the OpenAI function-calling schema. */
    String getName();

    /** Full tool definition in OpenAI function-calling format. */
    Map<String, Object> getDefinition();

    /**
     * Execute the tool with the given JSON arguments string.
     * @param argsJson raw JSON string from the model, e.g. {@code {"path":"foo.md"}}
     * @return result text that is fed back to the model as a tool message
     */
    String execute(String argsJson);

    /**
     * Returns a short human-readable description of what this call is doing,
     * shown to the user via the {@code tool_call} SSE event.
     */
    String describe(String argsJson);

    /**
     * Logical group for UI toggles and request filtering (e.g. {@code web}, {@code wiki}).
     * Default matches tools that did not override (clarification, glossary).
     */
    default String getToolkit() {
        return ToolkitIds.ASSISTANT;
    }
}
