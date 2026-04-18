package com.assistant.testing_ai_ignore_this;

import java.util.List;

public class Conversation {
    private List<Message> messages;

}

class Message {
    String role; // Assistant,User
}

abstract class Role {
  abstract String name();
  abstract boolean isLLM();
}

class User extends Role {
    @Override String name() {
        return "User";
    }
    @Override boolean isLLM() {
        return false;
    }
}

class Assistant extends Role {
    @Override String name() {
        return "Assistant";
    }
    @Override boolean isLLM() {
        return true;
    }
    String mode; // Creative Writing
    LLM llm; // Grok, GPT, QWEN
    boolean usedReasoning;
}

class LLM
{
    String name; // Grok 4.2
    LLMCapabilities capabilities;
}

enum LLMCapabilities {
    ONLY_NON_REASONING,
    ONLY_REASONING,
    BOTH
}
