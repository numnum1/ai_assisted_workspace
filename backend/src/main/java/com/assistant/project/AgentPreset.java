package com.assistant.project;

import com.assistant.agent.Agent;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Project-scoped guided chat agent template stored in {@code .assistant/agents.json}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class AgentPreset implements Agent {

    private String id;
    private String name;
    private String modeId;
    private String llmId;
    /** Legacy: optional LLM override for fork/thread (prefer {@link #threadModeId}). */
    private String threadLlmId;
    /** Optional mode for fork/thread when parent chat uses this preset ({@code agentPresetId}). */
    private String threadModeId;
    private boolean useReasoning;
    @Setter(AccessLevel.NONE)
    private List<String> disabledToolkits = new ArrayList<>();
    private String initialSteeringPlan;

    public void setDisabledToolkits(List<String> disabledToolkits) {
        this.disabledToolkits = disabledToolkits != null ? disabledToolkits : new ArrayList<>();
    }
}
