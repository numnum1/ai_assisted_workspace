package com.assistant.model;

import java.util.ArrayList;
import java.util.List;


public class ProjectConfig {

    public static class ExtraFeatures {
        /** When true, the UI may offer downloading chat history as a file (client-side). */
        private boolean chatDownload = false;

        public boolean isChatDownload() {
            return chatDownload;
        }

        public void setChatDownload(boolean chatDownload) {
            this.chatDownload = chatDownload;
        }
    }

    private String name = "";
    private String description = "";
    private List<String> alwaysInclude = new ArrayList<>();
    private String defaultMode = "";
    /** Built-in workspace mode id: book, music, default, ... (classpath: workspace-modes/{id}.yaml) */
    private String workspaceMode = "default";
    /** Optional LLM id (from AppData providers) for the floating Quick Chat; empty = first available. */
    private String quickChatLlmId = "";
    private ExtraFeatures extraFeatures = new ExtraFeatures();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<String> getAlwaysInclude() { return alwaysInclude; }
    public void setAlwaysInclude(List<String> alwaysInclude) { this.alwaysInclude = alwaysInclude; }
    public String getDefaultMode() { return defaultMode; }
    public void setDefaultMode(String defaultMode) { this.defaultMode = defaultMode != null ? defaultMode : ""; }
    public String getWorkspaceMode() { return workspaceMode; }
    public void setWorkspaceMode(String workspaceMode) { this.workspaceMode = workspaceMode != null ? workspaceMode : "default"; }
    public String getQuickChatLlmId() { return quickChatLlmId; }
    public void setQuickChatLlmId(String quickChatLlmId) { this.quickChatLlmId = quickChatLlmId != null ? quickChatLlmId : ""; }
    public ExtraFeatures getExtraFeatures() {
        if (extraFeatures == null) {
            extraFeatures = new ExtraFeatures();
        }
        return extraFeatures;
    }

    public void setExtraFeatures(ExtraFeatures extraFeatures) {
        this.extraFeatures = extraFeatures != null ? extraFeatures : new ExtraFeatures();
    }
}
