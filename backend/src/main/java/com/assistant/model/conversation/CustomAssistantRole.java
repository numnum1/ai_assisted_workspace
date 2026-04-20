package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class CustomAssistantRole extends AssistantRole {

    private String mode;
    private LLM llm = new LLM();
    private boolean usesReasoning;

    @Override
    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    @Override
    public LLM getLlm() {
        return llm;
    }

    public void setLlm(LLM llm) {
        this.llm = llm != null ? llm : new LLM();
    }

    @Override
    public boolean isUsesReasoning() {
        return usesReasoning;
    }

    public void setUsesReasoning(boolean usesReasoning) {
        this.usesReasoning = usesReasoning;
    }
}
