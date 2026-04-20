package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class AssistantConversationMessage extends ConversationMessage {

    @Setter(AccessLevel.NONE)
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
