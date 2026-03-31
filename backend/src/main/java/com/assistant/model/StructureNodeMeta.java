package com.assistant.model;

import java.util.HashMap;
import java.util.Map;

public class StructureNodeMeta {

    private String title = "";
    private String description = "";
    private int sortOrder = 0;
    private Map<String, String> extras = new HashMap<>();

    public StructureNodeMeta() {}

    public StructureNodeMeta(String title, String description, int sortOrder) {
        this.title = title;
        this.description = description;
        this.sortOrder = sortOrder;
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public Map<String, String> getExtras() { return extras; }
    public void setExtras(Map<String, String> extras) { this.extras = extras != null ? extras : new HashMap<>(); }
}
