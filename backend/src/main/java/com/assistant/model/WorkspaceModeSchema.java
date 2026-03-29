package com.assistant.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loaded from classpath workspace-modes/{id}.yaml and returned to the frontend
 * as JSON for labels, icons, and meta field definitions.
 */
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

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id != null ? id : "book";
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name != null ? name : "";
    }

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon != null ? icon : "folder";
    }

    public boolean isMediaType() {
        return mediaType;
    }

    public void setMediaType(boolean mediaType) {
        this.mediaType = mediaType;
    }

    public String getEditorMode() {
        return editorMode;
    }

    public void setEditorMode(String editorMode) {
        this.editorMode = editorMode != null ? editorMode : "prose";
    }

    public String getProseLeafLevel() {
        return proseLeafLevel;
    }

    public void setProseLeafLevel(String proseLeafLevel) {
        this.proseLeafLevel = proseLeafLevel != null && !proseLeafLevel.isBlank() ? proseLeafLevel : "action";
    }

    public String getRootMetaLabel() {
        return rootMetaLabel;
    }

    public void setRootMetaLabel(String rootMetaLabel) {
        this.rootMetaLabel = rootMetaLabel != null ? rootMetaLabel : "";
    }

    public String getRootMetaIcon() {
        return rootMetaIcon;
    }

    public void setRootMetaIcon(String rootMetaIcon) {
        this.rootMetaIcon = rootMetaIcon != null ? rootMetaIcon : "book";
    }

    public List<WorkspaceLevelConfig> getLevels() {
        return levels;
    }

    public void setLevels(List<WorkspaceLevelConfig> levels) {
        this.levels = levels != null ? levels : new ArrayList<>();
    }

    public Map<String, MetaTypeSchemaPayload> getMetaSchemas() {
        return metaSchemas;
    }

    public void setMetaSchemas(Map<String, MetaTypeSchemaPayload> metaSchemas) {
        this.metaSchemas = metaSchemas != null ? metaSchemas : new LinkedHashMap<>();
    }

    public String getSystemPromptAddition() {
        return systemPromptAddition;
    }

    public void setSystemPromptAddition(String systemPromptAddition) {
        this.systemPromptAddition = systemPromptAddition != null ? systemPromptAddition : "";
    }

    public static class WorkspaceLevelConfig {
        private String key = "";
        private String label = "";
        private String labelNew = "";
        private String icon = "";

        public String getKey() {
            return key;
        }

        public void setKey(String key) {
            this.key = key != null ? key : "";
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label != null ? label : "";
        }

        public String getLabelNew() {
            return labelNew;
        }

        public void setLabelNew(String labelNew) {
            this.labelNew = labelNew != null ? labelNew : "";
        }

        public String getIcon() {
            return icon;
        }

        public void setIcon(String icon) {
            this.icon = icon != null ? icon : "";
        }
    }

    public static class MetaTypeSchemaPayload {
        private String filename = "";
        private List<MetaFieldPayload> fields = new ArrayList<>();

        public String getFilename() {
            return filename;
        }

        public void setFilename(String filename) {
            this.filename = filename != null ? filename : "";
        }

        public List<MetaFieldPayload> getFields() {
            return fields;
        }

        public void setFields(List<MetaFieldPayload> fields) {
            this.fields = fields != null ? fields : new ArrayList<>();
        }
    }

    public static class MetaFieldPayload {
        private String key = "";
        private String label = "";
        private String type = "";
        private String placeholder = "";
        private String defaultValue = "";
        private List<String> options = new ArrayList<>();

        public String getKey() {
            return key;
        }

        public void setKey(String key) {
            this.key = key != null ? key : "";
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label != null ? label : "";
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type != null ? type : "";
        }

        public String getPlaceholder() {
            return placeholder;
        }

        public void setPlaceholder(String placeholder) {
            this.placeholder = placeholder != null ? placeholder : "";
        }

        public String getDefaultValue() {
            return defaultValue;
        }

        public void setDefaultValue(String defaultValue) {
            this.defaultValue = defaultValue != null ? defaultValue : "";
        }

        public List<String> getOptions() {
            return options;
        }

        public void setOptions(List<String> options) {
            this.options = options != null ? options : new ArrayList<>();
        }
    }
}
