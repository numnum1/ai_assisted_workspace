package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = ChatPart.class, name = "CHAT"),
        @JsonSubTypes.Type(value = ThoughtsPart.class, name = "THOUGHTS"),
        @JsonSubTypes.Type(value = ExploringPart.class, name = "EXPLORING"),
        @JsonSubTypes.Type(value = ReadFilePart.class, name = "READ_FILE"),
        @JsonSubTypes.Type(value = ReadLinesPart.class, name = "READ_LINES"),
        @JsonSubTypes.Type(value = MultipleChoicePart.class, name = "MULTIPLE_CHOICE"),
        @JsonSubTypes.Type(value = ThreadStartPart.class, name = "THREAD_START"),
        @JsonSubTypes.Type(value = ThreadMergePart.class, name = "THREAD_MERGE"),
})
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class MessagePart {

    private TurnStatus status = TurnStatus.COMPLETED;

    public TurnStatus getStatus() {
        return status;
    }

    public void setStatus(TurnStatus status) {
        this.status = status != null ? status : TurnStatus.COMPLETED;
    }
}
