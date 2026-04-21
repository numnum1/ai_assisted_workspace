package com.assistant.conversation;

import com.assistant.conversation.model.AgenticConversation;
import com.assistant.conversation.model.Conversation;
import com.assistant.conversation.model.NormalConversation;
import org.junit.jupiter.api.Test;

import static com.assistant.resources.ChatBotMode.Mode_With_GROK;

class ConversationTest {

    @Test
    void run() {
        Conversation agenticConversation = new AgenticConversation();
        agenticConversation.setTitle("My New Conversation");
        agenticConversation.setMode(Mode_With_GROK);

        Conversation normalConversation = new NormalConversation();
        normalConversation.setTitle("My New Conversation");
        normalConversation.setMode(Mode_With_GROK);

        System.out.println(normalConversation);
    }

}
