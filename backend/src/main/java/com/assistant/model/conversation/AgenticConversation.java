package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Guided conversation driven by a project {@link com.assistant.model.AgentPreset}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class AgenticConversation extends GuidedConversation {

    private String agentPresetId;
    /** Current steering plan (updated during the session). */
    private Plan plan = new Plan();
    private AgentAssistantRole assistant = new AgentAssistantRole();

    public String getAgentPresetId() {
        return agentPresetId;
    }

    public void setAgentPresetId(String agentPresetId) {
        this.agentPresetId = agentPresetId;
        if (assistant != null) {
            assistant.setAgentPresetId(agentPresetId);
        }
    }

    @Override
    public Plan getPlan() {
        return plan;
    }

    public void setPlan(Plan plan) {
        this.plan = plan != null ? plan : new Plan();
    }

    @Override
    public AgentAssistantRole getAssistant() {
        return assistant;
    }

    public void setAssistant(AgentAssistantRole assistant) {
        this.assistant = assistant != null ? assistant : new AgentAssistantRole();
        if (this.agentPresetId != null && this.assistant.getAgentPresetId() == null) {
            this.assistant.setAgentPresetId(this.agentPresetId);
        }
    }
}
