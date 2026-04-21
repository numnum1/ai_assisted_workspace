package com.assistant.conversation.model;

import com.assistant.agent.Agent;
import com.assistant.project.AgentPreset;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class AgentAssistantRole extends AssistantRole {
    private Agent agent;
    private String mode;
    private LLM llm;
    private boolean usesReasoning;
}
