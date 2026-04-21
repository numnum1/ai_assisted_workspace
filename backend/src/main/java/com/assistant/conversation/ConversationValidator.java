package com.assistant.conversation;

import com.assistant.conversation.model.Conversation;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;

@Deprecated
@Component
public class ConversationValidator {

    public void validate(Conversation c) {
        Assert.notNull(c, "conversation");
        Assert.hasText(c.getTitle(), "conversation.title is required");
        Assert.notNull(c.getAssistant(), "conversation.assistant is required");
        Assert.notNull(c.getMessages(), "conversation.messages is required");
    }

    public void validatePatch(String conversationId, String bodyId) {
        Assert.hasText(conversationId, "conversationId");
        if (StringUtils.hasText(bodyId)) {
            Assert.isTrue(conversationId.equals(bodyId), "path id and body id must match");
        }
    }
}
