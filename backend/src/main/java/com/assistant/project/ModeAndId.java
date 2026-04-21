package com.assistant.project;

import com.assistant.conversation.model.Mode;

public record ModeAndId(String id, Mode<LLMConfig> mode) {
    // Utils
    public String getLLMId() {
        return mode.getLlm().getId();
    }
}
