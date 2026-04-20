package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.Setter;

/**
 * Base for persisted tool-call UI parts (distinct from OpenAI {@link com.assistant.model.ToolCall}).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public abstract class ToolCallPart extends MessagePart {

    private String toolCallId;
}
