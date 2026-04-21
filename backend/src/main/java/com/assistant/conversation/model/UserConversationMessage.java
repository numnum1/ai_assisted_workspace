package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class UserConversationMessage extends ConversationMessage {

    @Setter(AccessLevel.NONE)
    private List<MessagePart> parts = new ArrayList<>();
    @Setter(AccessLevel.NONE)
    private List<String> attachedFiles = new ArrayList<>();
    /** File-expanded user message content used for LLM history reconstruction. */
    private String resolvedContent;

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

    public void setAttachedFiles(List<String> attachedFiles) {
        this.attachedFiles = attachedFiles != null ? attachedFiles : new ArrayList<>();
    }
}
