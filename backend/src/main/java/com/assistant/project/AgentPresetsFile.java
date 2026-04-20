package com.assistant.project;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Root JSON object for {@code .assistant/agents.json}.
 */
@Getter
@Setter
public class AgentPresetsFile {

    private int version = 1;
    @Setter(AccessLevel.NONE)
    private List<AgentPreset> agents = new ArrayList<>();

    public void setAgents(List<AgentPreset> agents) {
        this.agents = agents != null ? agents : new ArrayList<>();
    }
}
