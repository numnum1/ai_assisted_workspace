package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class Mode {

    private String id;
    private String name;
    private String systemPrompt;
    private List<String> autoIncludes = new ArrayList<>();
    private List<String> rules = new ArrayList<>();
    private String color;
    private boolean useReasoning = false;
    /** When true, mode is for guided/agent presets only — not offered in the main chat mode selector. */
    private boolean agentOnly = false;
    private String llmId;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }
    public List<String> getAutoIncludes() { return autoIncludes; }
    public void setAutoIncludes(List<String> autoIncludes) { this.autoIncludes = autoIncludes; }
    public List<String> getRules() { return rules; }
    public void setRules(List<String> rules) { this.rules = rules; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public boolean isUseReasoning() { return useReasoning; }
    public void setUseReasoning(boolean useReasoning) { this.useReasoning = useReasoning; }
    public boolean isAgentOnly() { return agentOnly; }
    public void setAgentOnly(boolean agentOnly) { this.agentOnly = agentOnly; }
    public String getLlmId() { return llmId; }
    public void setLlmId(String llmId) { this.llmId = llmId; }
}
