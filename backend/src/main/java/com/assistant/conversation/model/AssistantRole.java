package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "roleType", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = CustomAssistantRole.class, name = "CUSTOM"),
        @JsonSubTypes.Type(value = AgentAssistantRole.class, name = "AGENT"),
})
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class AssistantRole {

    public abstract String getMode();

    public abstract LLM getLlm();

    public abstract boolean isUsesReasoning();

    /**
     * Future: assembled system prompt for this assistant.
     */
    public String getSystemPrompt() {
        return "";
    }
}
