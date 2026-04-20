package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Base for persisted tool-call UI parts (distinct from OpenAI {@link com.assistant.model.ToolCall}).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class ToolCallPart extends MessagePart {

    private String toolCallId;

    public String getToolCallId() {
        return toolCallId;
    }

    public void setToolCallId(String toolCallId) {
        this.toolCallId = toolCallId;
    }
}
