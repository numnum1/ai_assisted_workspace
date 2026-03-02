package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class FileNode {

    private String name;
    private String path;
    private boolean directory;
    private List<FileNode> children;

    public FileNode() {}

    public FileNode(String name, String path, boolean directory) {
        this.name = name;
        this.path = path;
        this.directory = directory;
        this.children = directory ? new ArrayList<>() : null;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public boolean isDirectory() { return directory; }
    public void setDirectory(boolean directory) { this.directory = directory; }
    public List<FileNode> getChildren() { return children; }
    public void setChildren(List<FileNode> children) { this.children = children; }
}
