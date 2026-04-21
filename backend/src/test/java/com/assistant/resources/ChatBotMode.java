package com.assistant.resources;

import com.assistant.conversation.model.LLM;
import com.assistant.conversation.model.Mode;

public class ChatBotMode extends Mode {
    public static final ChatBotMode Mode_With_GROK = new ChatBotMode(Grok.INSTANCE);
    public ChatBotMode(LLM defaultLLM) {
        super("Chat Bot", "You are a normal chat bot. Be friendly", "#F0F0F0", false, defaultLLM, false);
    }
}
