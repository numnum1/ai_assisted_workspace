package com.assistant.conversation.model;

import com.assistant.conversation.old_models_to_replace.AgentPreset;
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

    private String agentPresetId;
    /** Current steering plan (updated during the session). */
    @Setter(AccessLevel.NONE)
    private Plan plan = new Plan();
    @Setter(AccessLevel.NONE)
    private AgentAssistantRole assistant = new AgentAssistantRole();

    public void setAgentPresetId(String agentPresetId) {
        this.agentPresetId = agentPresetId;
        if (assistant != null) {
            assistant.setAgentPresetId(agentPresetId);
        }
    }

    public void setPlan(Plan plan) {
        this.plan = plan != null ? plan : new Plan();
    }

    public void setAssistant(AgentAssistantRole assistant) {
        this.assistant = assistant != null ? assistant : new AgentAssistantRole();
        if (this.agentPresetId != null && this.assistant.getAgentPresetId() == null) {
            this.assistant.setAgentPresetId(this.agentPresetId);
        }
    }
}
