package com.assistant.model;

import java.util.List;

public class WikiType {

    private String id;
    private String name;
    private List<WikiFieldDef> fields;

    public WikiType() {}

    public WikiType(String id, String name, List<WikiFieldDef> fields) {
        this.id = id;
        this.name = name;
        this.fields = fields;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public List<WikiFieldDef> getFields() { return fields; }
    public void setFields(List<WikiFieldDef> fields) { this.fields = fields; }
}
