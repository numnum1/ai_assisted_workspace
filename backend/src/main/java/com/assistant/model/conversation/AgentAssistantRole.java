package com.assistant.model.conversation;

import com.assistant.model.AgentPreset;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

/**
 * Assistant bound to a project {@link AgentPreset}; {@link #applyFromPreset} fills denormalized fields.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class AgentAssistantRole extends AssistantRole {

    private String agentPresetId;
    /** Denormalized after {@link #applyFromPreset}; may be empty before materialization. */
    @Getter(AccessLevel.NONE)
    private String mode;
    @Setter(AccessLevel.NONE)
    private LLM llm = new LLM();
    private boolean usesReasoning;

    @Override
    public String getMode() {
        return mode != null ? mode : "";
    }

    public void setLlm(LLM llm) {
        this.llm = llm != null ? llm : new LLM();
    }

    public void applyFromPreset(AgentPreset preset) {
        if (preset == null) {
            return;
        }
        this.agentPresetId = preset.getId();
        this.mode = preset.getModeId() != null ? preset.getModeId() : "";
        String display = preset.getName() != null && !preset.getName().isBlank()
                ? preset.getName()
                : (preset.getId() != null ? preset.getId() : "agent");
        this.llm = new LLM(display, LLMCapabilities.BOTH);
        this.usesReasoning = preset.isUseReasoning();
    }
}
