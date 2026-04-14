package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Root JSON object for {@code .assistant/agents.json}.
 */
public class AgentPresetsFile {

    private int version = 1;
    private List<AgentPreset> agents = new ArrayList<>();

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public List<AgentPreset> getAgents() {
        return agents;
    }

    public void setAgents(List<AgentPreset> agents) {
        this.agents = agents != null ? agents : new ArrayList<>();
    }
}
