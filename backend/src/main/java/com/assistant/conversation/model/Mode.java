package com.assistant.conversation.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
public class Mode<LlmType extends LLM> {
    private String name;
    private String systemPrompt;
    private String color;
    private boolean agentOnly;
    private LlmType llm;
    private boolean useReasoningByDefault;
    private List<String> autoIncludes = new ArrayList<>();

    public Mode(String name, String systemPrompt, String color, boolean agentOnly, LlmType llm, boolean useReasoningByDefault) {
        this.name = name;
        this.systemPrompt = systemPrompt;
        this.color = color;
        this.agentOnly = agentOnly;
        this.llm = llm;
        this.useReasoningByDefault = useReasoningByDefault;
    }
}
