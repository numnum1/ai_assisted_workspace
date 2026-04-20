package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class NormalConversation extends Conversation {

    @Setter(AccessLevel.NONE)
    private CustomAssistantRole assistant = new CustomAssistantRole();

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
