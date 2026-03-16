package com.assistant.model;

import java.util.Map;

public class WikiEntry {

    private String id;
    private String typeId;
    private Map<String, String> values;

    public WikiEntry() {}

    public WikiEntry(String id, String typeId, Map<String, String> values) {
        this.id = id;
        this.typeId = typeId;
        this.values = values;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTypeId() { return typeId; }
    public void setTypeId(String typeId) { this.typeId = typeId; }

    public Map<String, String> getValues() { return values; }
    public void setValues(Map<String, String> values) { this.values = values; }
}
