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
    @Getter(AccessLevel.NONE)
    private String mode;
    @Setter(AccessLevel.NONE)
    private LLM llm = new LLM();
    private boolean usesReasoning;

    @Override
    public String getMode() {
        return mode != null ? mode : "";
    }

    public void setLlm(LLM llm) {
        this.llm = llm != null ? llm : new LLM();
    }

}
