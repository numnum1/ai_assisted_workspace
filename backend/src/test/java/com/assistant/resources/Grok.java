package com.assistant.resources;

import com.assistant.conversation.model.LLM;
import com.assistant.conversation.model.LLMCapabilities;

public class Grok extends LLM {
    public static final Grok INSTANCE = new Grok();
    @Override public LLMCapabilities getCapabilities() {
        return LLMCapabilities.BOTH;
    }
}
