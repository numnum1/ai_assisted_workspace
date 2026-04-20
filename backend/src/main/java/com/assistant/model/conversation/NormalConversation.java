package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class NormalConversation extends Conversation {

    private CustomAssistantRole assistant = new CustomAssistantRole();

    @Override
    public CustomAssistantRole getAssistant() {
        return assistant;
    }

    public void setAssistant(CustomAssistantRole assistant) {
        this.assistant = assistant != null ? assistant : new CustomAssistantRole();
    }

    @Override
    public boolean isGuidedChat() {
        return false;
    }

    @Override
    public Plan getPlan() {
        return null;
    }
}
