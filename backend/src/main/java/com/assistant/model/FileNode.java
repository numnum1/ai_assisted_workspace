package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class FileNode {

    private String name;
    private String path;
    private boolean directory;
    private List<FileNode> children;
    /** If this directory contains {@code .subproject.json}, the declared workspace mode id (e.g. book). */
    private String subprojectType;
    /** True if a shadow meta-note file exists under {@code .wiki/files/} for this file node. */
    private boolean hasShadow;

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

    public String getSubprojectType() { return subprojectType; }
    public void setSubprojectType(String subprojectType) { this.subprojectType = subprojectType; }

    public boolean isHasShadow() { return hasShadow; }
    public void setHasShadow(boolean hasShadow) { this.hasShadow = hasShadow; }
}
