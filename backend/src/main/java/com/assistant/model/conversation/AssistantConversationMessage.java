package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class AssistantConversationMessage extends ConversationMessage {

    private List<MessagePart> parts = new ArrayList<>();

    @Override
    public ConversationSpeaker getSpeaker() {
        return ConversationSpeaker.ASSISTANT;
    }

    @Override
    public List<MessagePart> getParts() {
        return parts;
    }

    public void setParts(List<MessagePart> parts) {
        this.parts = parts != null ? parts : new ArrayList<>();
    }

    public TurnStatus deriveStatus() {
        for (MessagePart p : parts) {
            if (p.getStatus() == TurnStatus.STREAMING) {
                return TurnStatus.STREAMING;
            }
        }
        return TurnStatus.COMPLETED;
    }
}
