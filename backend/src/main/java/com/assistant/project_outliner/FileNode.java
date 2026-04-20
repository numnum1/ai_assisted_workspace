package com.assistant.project_outliner;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class FileNode {

    private String name;
    private String path;
    private boolean directory;
    private List<FileNode> children;
    /** If this directory contains {@code .subproject.json}, the declared workspace mode id (e.g. book). */
    private String subprojectType;

    public FileNode(String name, String path, boolean directory) {
        this.name = name;
        this.path = path;
        this.directory = directory;
        this.children = directory ? new ArrayList<>() : null;
    }
}
