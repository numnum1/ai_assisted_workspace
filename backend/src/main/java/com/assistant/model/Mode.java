package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class Mode {

    private String id;
    private String name;
    private String systemPrompt;
    private List<String> autoIncludes = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }
    public List<String> getAutoIncludes() { return autoIncludes; }
    public void setAutoIncludes(List<String> autoIncludes) { this.autoIncludes = autoIncludes; }
}
