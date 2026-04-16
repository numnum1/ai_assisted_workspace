package com.assistant.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * Project-scoped guided chat agent template stored in {@code .assistant/agents.json}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class AgentPreset {

    private String id;
    private String name;
    private String modeId;
    private String llmId;
    /** Optional LLM for fork/thread conversations when parent chat uses this preset ({@code agentPresetId}). */
    private String threadLlmId;
    private boolean useReasoning;
    private List<String> disabledToolkits = new ArrayList<>();
    private String initialSteeringPlan;

    public AgentPreset() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getModeId() {
        return modeId;
    }

    public void setModeId(String modeId) {
        this.modeId = modeId;
    }

    public String getLlmId() {
        return llmId;
    }

    public void setLlmId(String llmId) {
        this.llmId = llmId;
    }

    public String getThreadLlmId() {
        return threadLlmId;
    }

    public void setThreadLlmId(String threadLlmId) {
        this.threadLlmId = threadLlmId;
    }

    public boolean isUseReasoning() {
        return useReasoning;
    }

    public void setUseReasoning(boolean useReasoning) {
        this.useReasoning = useReasoning;
    }

    public List<String> getDisabledToolkits() {
        return disabledToolkits;
    }

    public void setDisabledToolkits(List<String> disabledToolkits) {
        this.disabledToolkits = disabledToolkits != null ? disabledToolkits : new ArrayList<>();
    }

    public String getInitialSteeringPlan() {
        return initialSteeringPlan;
    }

    public void setInitialSteeringPlan(String initialSteeringPlan) {
        this.initialSteeringPlan = initialSteeringPlan;
    }
}
