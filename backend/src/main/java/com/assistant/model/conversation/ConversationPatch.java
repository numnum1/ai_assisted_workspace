package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Partial update for {@link Conversation} (PATCH).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ConversationPatch {

    private String id;
    private String title;
    private String planTitle;
    private String planContent;
    private Boolean savedToProject;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getPlanTitle() {
        return planTitle;
    }

    public void setPlanTitle(String planTitle) {
        this.planTitle = planTitle;
    }

    public String getPlanContent() {
        return planContent;
    }

    public void setPlanContent(String planContent) {
        this.planContent = planContent;
    }

    public Boolean getSavedToProject() {
        return savedToProject;
    }

    public void setSavedToProject(Boolean savedToProject) {
        this.savedToProject = savedToProject;
    }
}
