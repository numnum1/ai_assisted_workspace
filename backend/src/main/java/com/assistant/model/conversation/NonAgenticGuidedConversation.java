package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Guided conversation with explicit plan and a custom assistant (no {@link com.assistant.model.AgentPreset}).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class NonAgenticGuidedConversation extends GuidedConversation {

    private Plan plan = new Plan();
    private CustomAssistantRole assistant = new CustomAssistantRole();

    @Override
    public Plan getPlan() {
        return plan;
    }

    public void setPlan(Plan plan) {
        this.plan = plan != null ? plan : new Plan();
    }

    @Override
    public CustomAssistantRole getAssistant() {
        return assistant;
    }

    public void setAssistant(CustomAssistantRole assistant) {
        this.assistant = assistant != null ? assistant : new CustomAssistantRole();
    }
}
