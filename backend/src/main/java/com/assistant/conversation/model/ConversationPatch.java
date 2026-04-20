package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

/**
 * Partial update for {@link Conversation} (PATCH).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Data
public class ConversationPatch {

    private String id;
    private String title;
    private String planTitle;
    private String planContent;
    private Boolean savedToProject;
}
