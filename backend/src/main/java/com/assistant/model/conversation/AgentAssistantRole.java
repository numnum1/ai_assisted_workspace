package com.assistant.model.conversation;

import com.assistant.model.AgentPreset;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Assistant bound to a project {@link AgentPreset}; {@link #applyFromPreset} fills denormalized fields.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class AgentAssistantRole extends AssistantRole {

    private String agentPresetId;
    /** Denormalized after {@link #applyFromPreset}; may be empty before materialization. */
    private String mode;
    private LLM llm = new LLM();
    private boolean usesReasoning;

    public String getAgentPresetId() {
        return agentPresetId;
    }

    public void setAgentPresetId(String agentPresetId) {
        this.agentPresetId = agentPresetId;
    }

    @Override
    public String getMode() {
        return mode != null ? mode : "";
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
