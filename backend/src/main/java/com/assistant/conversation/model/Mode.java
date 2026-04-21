package com.assistant.conversation.model;

import com.assistant.project.dto.ModeDto;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.servlet.ModelAndViewDefiningException;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Mode<LlmType extends LLM> {
    private String name;
    private String systemPrompt;
    private String color;
    private boolean agentOnly;
    private LlmType llm;
    private boolean useReasoningByDefault;
}
