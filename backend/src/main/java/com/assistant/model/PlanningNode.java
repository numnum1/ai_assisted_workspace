package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class PlanningNode {

    private String path;
    private String type;
    private String title;
    private String status;
    private String source;
    private List<PlanningNode> children;

    public PlanningNode() {
        this.children = new ArrayList<>();
    }

    public PlanningNode(String path, String type, String title, String status, String source) {
        this.path = path;
        this.type = type;
        this.title = title;
        this.status = status;
        this.source = source;
        this.children = new ArrayList<>();
    }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public List<PlanningNode> getChildren() { return children; }
    public void setChildren(List<PlanningNode> children) { this.children = children; }
}
