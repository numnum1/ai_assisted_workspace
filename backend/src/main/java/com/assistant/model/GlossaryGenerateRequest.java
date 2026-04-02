package com.assistant.model;

public class GlossaryGenerateRequest {

    private String term;
    /** Recent chat as plain text for context (optional). */
    private String chatContext;

    public String getTerm() {
        return term;
    }

    public void setTerm(String term) {
        this.term = term;
    }

    public String getChatContext() {
        return chatContext;
    }

    public void setChatContext(String chatContext) {
        this.chatContext = chatContext;
    }
}
