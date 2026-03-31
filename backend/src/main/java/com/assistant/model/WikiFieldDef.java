package com.assistant.model;

public class WikiFieldDef {

    private String key;
    private String label;
    private String type;
    private String placeholder;
    private String defaultValue;

    public WikiFieldDef() {}

    public WikiFieldDef(String key, String label, String type, String placeholder, String defaultValue) {
        this.key = key;
        this.label = label;
        this.type = type;
        this.placeholder = placeholder;
        this.defaultValue = defaultValue;
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getPlaceholder() { return placeholder; }
    public void setPlaceholder(String placeholder) { this.placeholder = placeholder; }

    public String getDefaultValue() { return defaultValue; }
    public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }
}
