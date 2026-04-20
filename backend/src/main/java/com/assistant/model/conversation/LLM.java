package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Display-oriented LLM metadata for a conversation assistant role.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
@NoArgsConstructor
public class LLM {

    private String name;
    @Setter(AccessLevel.NONE)
    private LLMCapabilities capabilities = LLMCapabilities.BOTH;

    public LLM(String name, LLMCapabilities capabilities) {
        this.name = name;
        this.capabilities = capabilities != null ? capabilities : LLMCapabilities.BOTH;
    }

    public void setCapabilities(LLMCapabilities capabilities) {
        this.capabilities = capabilities != null ? capabilities : LLMCapabilities.BOTH;
    }
}
