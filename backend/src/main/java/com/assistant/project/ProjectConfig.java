package com.assistant.project;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class ProjectConfig {

    @Getter
    @Setter
    public static class ExtraFeatures {
        /** When true, the UI may offer downloading chat history as a file (client-side). */
        private boolean chatDownload = false;
    }

    private String name = "";
    private String description = "";
    private List<String> alwaysInclude = new ArrayList<>();
    @Setter(AccessLevel.NONE)
    private String defaultMode = "";
    /** Built-in workspace mode id: book, music, default, ... (classpath: workspace-modes/{id}.yaml) */
    @Setter(AccessLevel.NONE)
    private String workspaceMode = "default";
    /** Optional LLM id (from AppData providers) for the floating Quick Chat; empty = first available. */
    @Setter(AccessLevel.NONE)
    private String quickChatLlmId = "";
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private ExtraFeatures extraFeatures = new ExtraFeatures();

    public void setDefaultMode(String defaultMode) {
        this.defaultMode = defaultMode != null ? defaultMode : "";
    }

    public void setWorkspaceMode(String workspaceMode) {
        this.workspaceMode = workspaceMode != null ? workspaceMode : "default";
    }

    public void setQuickChatLlmId(String quickChatLlmId) {
        this.quickChatLlmId = quickChatLlmId != null ? quickChatLlmId : "";
    }

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
