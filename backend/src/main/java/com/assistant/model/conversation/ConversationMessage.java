package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "messageType", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = UserConversationMessage.class, name = "USER"),
        @JsonSubTypes.Type(value = AssistantConversationMessage.class, name = "ASSISTANT"),
})
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class ConversationMessage {

    private long timestamp;

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }

    public abstract ConversationSpeaker getSpeaker();

    public abstract java.util.List<MessagePart> getParts();
}
