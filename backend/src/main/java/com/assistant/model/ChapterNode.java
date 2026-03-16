package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class ChapterNode {

    private String id;
    private StructureNodeMeta meta;
    private List<SceneNode> scenes;

    public ChapterNode() {
        this.scenes = new ArrayList<>();
    }

    public ChapterNode(String id, StructureNodeMeta meta) {
        this.id = id;
        this.meta = meta;
        this.scenes = new ArrayList<>();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public StructureNodeMeta getMeta() { return meta; }
    public void setMeta(StructureNodeMeta meta) { this.meta = meta; }
    public List<SceneNode> getScenes() { return scenes; }
    public void setScenes(List<SceneNode> scenes) { this.scenes = scenes; }
}
