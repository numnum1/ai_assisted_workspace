package com.assistant.model;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class ChapterNode {

    private String id;
    private StructureNodeMeta meta;
    private List<SceneNode> scenes = new ArrayList<>();

    public ChapterNode(String id, StructureNodeMeta meta) {
        this.id = id;
        this.meta = meta;
        this.scenes = new ArrayList<>();
    }
}
