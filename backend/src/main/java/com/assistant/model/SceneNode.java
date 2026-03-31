package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class SceneNode {

    private String id;
    private StructureNodeMeta meta;
    private List<ActionNode> actions;

    public SceneNode() {
        this.actions = new ArrayList<>();
    }

    public SceneNode(String id, StructureNodeMeta meta) {
        this.id = id;
        this.meta = meta;
        this.actions = new ArrayList<>();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public StructureNodeMeta getMeta() { return meta; }
    public void setMeta(StructureNodeMeta meta) { this.meta = meta; }
    public List<ActionNode> getActions() { return actions; }
    public void setActions(List<ActionNode> actions) { this.actions = actions; }
}
