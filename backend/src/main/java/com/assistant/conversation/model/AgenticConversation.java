package com.assistant.conversation.model;

import com.assistant.agent.Agent;
import com.assistant.project.AgentPreset;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

/**
 * Guided conversation driven by a project {@link AgentPreset}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class AgenticConversation extends GuidedConversation {

    private Agent agent;
    /** Current steering plan (updated during the session). */
    @Setter(AccessLevel.NONE)
    private Plan plan = new Plan();
    @Setter(AccessLevel.NONE)
    private AgentAssistantRole assistant = new AgentAssistantRole();

    public void setPlan(Plan plan) {
        this.plan = plan != null ? plan : new Plan();
    }

}
