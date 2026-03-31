package com.assistant.model;

public class ChapterSummary {

    private String id;
    private StructureNodeMeta meta;

    public ChapterSummary() {}

    public ChapterSummary(String id, StructureNodeMeta meta) {
        this.id = id;
        this.meta = meta;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public StructureNodeMeta getMeta() { return meta; }
    public void setMeta(StructureNodeMeta meta) { this.meta = meta; }
}
