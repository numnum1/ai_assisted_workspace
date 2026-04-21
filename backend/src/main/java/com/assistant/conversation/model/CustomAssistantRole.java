package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class CustomAssistantRole extends AssistantRole {
    private String mode;
    @Setter(AccessLevel.NONE)
    private LLM llm;
    private boolean usesReasoning;
}
