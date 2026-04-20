package com.assistant.conversation.model;

import com.assistant.ai_provider.old_models.ToolCall;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.Setter;

/**
 * Base for persisted tool-call UI parts (distinct from OpenAI {@link ToolCall}).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public abstract class ToolCallPart extends MessagePart {

    private String toolCallId;
}
