package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = NormalConversation.class, name = "NORMAL"),
        @JsonSubTypes.Type(value = NonAgenticGuidedConversation.class, name = "NON_AGENTIC_GUIDED"),
        @JsonSubTypes.Type(value = AgenticConversation.class, name = "AGENTIC_GUIDED"),
})
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public abstract class Conversation {
    private String id;
    private String title;
    private Mode mode;
    @Setter(AccessLevel.PRIVATE)
    private long createdAt;
    private long updatedAt;
    private boolean savedToProject;
    @Setter(AccessLevel.NONE)
    private List<ConversationMessage> messages = new ArrayList<>();
    public abstract AssistantRole getAssistant();
    public abstract boolean isGuidedChat();
    public abstract Plan getPlan();
    /**
     * Future: build assembled context for LLM / inspector. Currently returns {@code null}.
     */
    public ConversationContext computeContext() {
        return null;
    }
    public void setMessages(List<ConversationMessage> messages) {
        this.messages = messages != null ? messages : new ArrayList<>();
    }

    protected Conversation(long createdAt) {
        setCreatedAt(createdAt);
        setAsNewUpdateTime();
    }

    protected Conversation() {
        setCreatedAt(Instant.now().getEpochSecond());
        setAsNewUpdateTime();
    }

    protected void setAsNewUpdateTime() {
        setUpdatedAt(Instant.now().getEpochSecond());
    }

}
