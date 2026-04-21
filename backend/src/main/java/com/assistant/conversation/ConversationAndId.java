package com.assistant.conversation;

import com.assistant.conversation.model.Conversation;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ConversationAndId {
    private String id;
    private Conversation conversation;
}
