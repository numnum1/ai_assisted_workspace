package com.assistant.model;

import lombok.Getter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loaded from classpath workspace-modes/{id}.yaml and returned to the frontend
 * as JSON for labels, icons, and meta field definitions.
 */
@Getter
public class WorkspaceModeSchema {

    private String id = "book";
    private String name = "";
    /** Lucide icon name for subproject folder in the file tree */
    private String icon = "folder";
    /** When true, the mode appears as an option for media subprojects */
    private boolean mediaType = false;
    /** e.g. prose, none — controls which editor UI the frontend shows */
    private String editorMode = "prose";
    /**
     * When {@code scene}, prose body lives on the scene row only (one implicit action per scene);
     * the outliner hides the action level. Empty or {@code action} = default three-level UI.
     */
    private String proseLeafLevel = "action";
    private String rootMetaLabel = "";
    private String rootMetaIcon = "book";
    private List<WorkspaceLevelConfig> levels = new ArrayList<>();
    /** Keys: root, chapter, scene, action */
    private Map<String, MetaTypeSchemaPayload> metaSchemas = new LinkedHashMap<>();
    /** Optional text appended to the LLM system prompt when this workspace mode is active */
    private String systemPromptAddition = "";

    public void setId(String id) {
        this.id = id != null ? id : "book";
    }

    public void setName(String name) {
        this.name = name != null ? name : "";
    }

    public void setIcon(String icon) {
        this.icon = icon != null ? icon : "folder";
    }

    public void setMediaType(boolean mediaType) {
        this.mediaType = mediaType;
    }

    public void setEditorMode(String editorMode) {
        this.editorMode = editorMode != null ? editorMode : "prose";
    }

    public void setProseLeafLevel(String proseLeafLevel) {
        this.proseLeafLevel = proseLeafLevel != null && !proseLeafLevel.isBlank() ? proseLeafLevel : "action";
    }

    public void setRootMetaLabel(String rootMetaLabel) {
        this.rootMetaLabel = rootMetaLabel != null ? rootMetaLabel : "";
    }

    public void setRootMetaIcon(String rootMetaIcon) {
        this.rootMetaIcon = rootMetaIcon != null ? rootMetaIcon : "book";
    }

    public void setLevels(List<WorkspaceLevelConfig> levels) {
        this.levels = levels != null ? levels : new ArrayList<>();
    }

    public void setMetaSchemas(Map<String, MetaTypeSchemaPayload> metaSchemas) {
        this.metaSchemas = metaSchemas != null ? metaSchemas : new LinkedHashMap<>();
    }

    public void setSystemPromptAddition(String systemPromptAddition) {
        this.systemPromptAddition = systemPromptAddition != null ? systemPromptAddition : "";
    }

    @Getter
    public static class WorkspaceLevelConfig {
        private String key = "";
        private String label = "";
        private String labelNew = "";
        private String icon = "";

        public void setKey(String key) {
            this.key = key != null ? key : "";
        }

        public void setLabel(String label) {
            this.label = label != null ? label : "";
        }

        public void setLabelNew(String labelNew) {
            this.labelNew = labelNew != null ? labelNew : "";
        }

        public void setIcon(String icon) {
            this.icon = icon != null ? icon : "";
        }
    }

    @Getter
    public static class MetaTypeSchemaPayload {
        private String filename = "";
        private List<MetaFieldPayload> fields = new ArrayList<>();

        public void setFilename(String filename) {
            this.filename = filename != null ? filename : "";
        }

        public void setFields(List<MetaFieldPayload> fields) {
            this.fields = fields != null ? fields : new ArrayList<>();
        }
    }

    @Getter
    public static class MetaFieldPayload {
        private String key = "";
        private String label = "";
        private String type = "";
        private String placeholder = "";
        private String defaultValue = "";
        private List<String> options = new ArrayList<>();

        public void setKey(String key) {
            this.key = key != null ? key : "";
        }

        public void setLabel(String label) {
            this.label = label != null ? label : "";
        }

        public void setType(String type) {
            this.type = type != null ? type : "";
        }

        public void setPlaceholder(String placeholder) {
            this.placeholder = placeholder != null ? placeholder : "";
        }

        public void setDefaultValue(String defaultValue) {
            this.defaultValue = defaultValue != null ? defaultValue : "";
        }

        public void setOptions(List<String> options) {
            this.options = options != null ? options : new ArrayList<>();
        }
    }
}
