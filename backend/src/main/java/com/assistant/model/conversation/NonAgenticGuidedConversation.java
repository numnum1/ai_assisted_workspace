package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

/**
 * Guided conversation with explicit plan and a custom assistant (no {@link com.assistant.model.AgentPreset}).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class NonAgenticGuidedConversation extends GuidedConversation {

    @Setter(AccessLevel.NONE)
    private Plan plan = new Plan();
    @Setter(AccessLevel.NONE)
    private CustomAssistantRole assistant = new CustomAssistantRole();

    public void setPlan(Plan plan) {
        this.plan = plan != null ? plan : new Plan();
    }

    public void setAssistant(CustomAssistantRole assistant) {
        this.assistant = assistant != null ? assistant : new CustomAssistantRole();
    }
}
