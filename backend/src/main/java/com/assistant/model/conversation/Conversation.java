package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.ArrayList;
import java.util.List;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = NormalConversation.class, name = "NORMAL"),
        @JsonSubTypes.Type(value = NonAgenticGuidedConversation.class, name = "NON_AGENTIC_GUIDED"),
        @JsonSubTypes.Type(value = AgenticConversation.class, name = "AGENTIC_GUIDED"),
})
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class Conversation {

    private String id;
    private String title;
    private String mode;
    private long createdAt;
    private long updatedAt;
    private boolean savedToProject;
    private String parentConversationId;
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

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }

    public boolean isSavedToProject() {
        return savedToProject;
    }

    public void setSavedToProject(boolean savedToProject) {
        this.savedToProject = savedToProject;
    }

    public String getParentConversationId() {
        return parentConversationId;
    }

    public void setParentConversationId(String parentConversationId) {
        this.parentConversationId = parentConversationId;
    }

    public List<ConversationMessage> getMessages() {
        return messages;
    }

    public void setMessages(List<ConversationMessage> messages) {
        this.messages = messages != null ? messages : new ArrayList<>();
    }
}
