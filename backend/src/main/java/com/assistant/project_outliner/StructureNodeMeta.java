package com.assistant.project_outliner;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
public class StructureNodeMeta {

    private String title = "";
    private String description = "";
    private int sortOrder = 0;
    @Setter(AccessLevel.NONE)
    private Map<String, String> extras = new HashMap<>();

    public StructureNodeMeta(String title, String description, int sortOrder) {
        this.title = title;
        this.description = description;
        this.sortOrder = sortOrder;
    }

    public void setExtras(Map<String, String> extras) {
        this.extras = extras != null ? extras : new HashMap<>();
    }
}
