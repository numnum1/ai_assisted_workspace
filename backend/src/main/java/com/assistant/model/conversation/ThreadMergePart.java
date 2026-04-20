package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ThreadMergePart extends MessagePart {

    private String conversationId;
    private String summary;

    public ThreadMergePart() {}

    public ThreadMergePart(String conversationId, String summary) {
        this.conversationId = conversationId;
        this.summary = summary;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String conversationId) {
        this.conversationId = conversationId;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }
}
