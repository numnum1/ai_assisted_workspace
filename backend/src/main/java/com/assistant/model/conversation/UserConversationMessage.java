package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class UserConversationMessage extends ConversationMessage {

    private List<MessagePart> parts = new ArrayList<>();
    private List<String> attachedFiles = new ArrayList<>();

    @Override
    public ConversationSpeaker getSpeaker() {
        return ConversationSpeaker.USER;
    }

    @Override
    public List<MessagePart> getParts() {
        return parts;
    }

    public void setParts(List<MessagePart> parts) {
        this.parts = parts != null ? parts : new ArrayList<>();
    }

    public List<String> getAttachedFiles() {
        return attachedFiles;
    }

    public void setAttachedFiles(List<String> attachedFiles) {
        this.attachedFiles = attachedFiles != null ? attachedFiles : new ArrayList<>();
    }
}
