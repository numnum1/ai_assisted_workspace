package com.assistant.project;

import com.assistant.conversation.model.LLM;
import com.assistant.conversation.model.LLMCapabilities;
import com.assistant.project.dto.ModeDto;
import lombok.Data;

@Data
public class LLMConfig extends LLM {
    private String id;
    private LLMSetting fast;
    private LLMSetting reasoning;
    @Override public LLMCapabilities getCapabilities() {
        if (fast == null && reasoning != null) {
            return LLMCapabilities.ONLY_REASONING;
        }
        if (fast != null && reasoning == null) {
            return LLMCapabilities.ONLY_NON_REASONING;
        }
        if (fast != null && reasoning != null) {
            return LLMCapabilities.BOTH;
        }
        throw new IllegalStateException("LLM: " + getName() + " has no valid setting");
    }
}
