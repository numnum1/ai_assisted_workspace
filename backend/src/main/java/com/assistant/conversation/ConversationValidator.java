package com.assistant.conversation;

import com.assistant.conversation.model.AgenticConversation;
import com.assistant.conversation.model.Conversation;
import com.assistant.conversation.model.GuidedConversation;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;

@Deprecated
@Component
public class ConversationValidator {

    public void validate(Conversation c) {
        Assert.notNull(c, "conversation");
        Assert.hasText(c.getId(), "conversation.id is required");
        Assert.hasText(c.getTitle(), "conversation.title is required");
        Assert.notNull(c.getAssistant(), "conversation.assistant is required");
        Assert.notNull(c.getMessages(), "conversation.messages is required");

        if (c instanceof GuidedConversation) {
            Assert.notNull(c.getPlan(), "plan is required for guided conversation");
        }
        if (c instanceof AgenticConversation ac) {
            Assert.hasText(ac.getAgentPresetId(), "agentPresetId is required for agentic conversation");
        }
    }

    public void validatePatch(String conversationId, String bodyId) {
        Assert.hasText(conversationId, "conversationId");
        if (StringUtils.hasText(bodyId)) {
            Assert.isTrue(conversationId.equals(bodyId), "path id and body id must match");
        }
    }
}
