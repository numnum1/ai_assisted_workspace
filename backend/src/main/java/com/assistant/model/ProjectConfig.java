package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class ProjectConfig {

    private String name = "";
    private String description = "";
    private List<String> alwaysInclude = new ArrayList<>();
    private List<String> globalRules = new ArrayList<>();
    private String defaultMode = "";
    /** Built-in workspace mode id: book, music, default, ... (classpath: workspace-modes/{id}.yaml) */
    private String workspaceMode = "default";

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<String> getAlwaysInclude() { return alwaysInclude; }
    public void setAlwaysInclude(List<String> alwaysInclude) { this.alwaysInclude = alwaysInclude; }
    public List<String> getGlobalRules() { return globalRules; }
    public void setGlobalRules(List<String> globalRules) { this.globalRules = globalRules; }
    public String getDefaultMode() { return defaultMode; }
    public void setDefaultMode(String defaultMode) { this.defaultMode = defaultMode != null ? defaultMode : ""; }
    public String getWorkspaceMode() { return workspaceMode; }
    public void setWorkspaceMode(String workspaceMode) { this.workspaceMode = workspaceMode != null ? workspaceMode : "default"; }
}
