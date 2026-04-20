package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Guided session with a binding steering {@link Plan}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public abstract class GuidedConversation extends Conversation {

    @Override
    public final boolean isGuidedChat() {
        return true;
    }
}
