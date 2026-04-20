package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Display-oriented LLM metadata for a conversation assistant role.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class LLM {

    private String name;
    private LLMCapabilities capabilities = LLMCapabilities.BOTH;

    public LLM() {}

    public LLM(String name, LLMCapabilities capabilities) {
        this.name = name;
        this.capabilities = capabilities != null ? capabilities : LLMCapabilities.BOTH;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public LLMCapabilities getCapabilities() {
        return capabilities;
    }

    public void setCapabilities(LLMCapabilities capabilities) {
        this.capabilities = capabilities != null ? capabilities : LLMCapabilities.BOTH;
    }
}
