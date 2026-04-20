package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ThoughtsPart extends MessagePart {

    private String content;

    public ThoughtsPart() {}

    public ThoughtsPart(String content) {
        this.content = content;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
