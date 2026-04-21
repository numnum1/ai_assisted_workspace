package com.assistant.conversation.history;

import com.assistant.ai_provider.old_models.ChatMessage;
import com.assistant.conversation.model.AssistantConversationMessage;
import com.assistant.conversation.model.ChatPart;
import com.assistant.conversation.model.Conversation;
import com.assistant.conversation.model.ConversationMessage;
import com.assistant.conversation.model.MessagePart;
import com.assistant.conversation.model.UserConversationMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Converts a {@link Conversation}'s {@link ConversationMessage} list into the flat
 * {@link ChatMessage} list expected by the OpenAI-compatible LLM API.
 *
 * <ul>
 *   <li>User messages use {@link UserConversationMessage#getResolvedContent()} when available
 *       (file-expanded), otherwise the first {@link ChatPart} content.</li>
 *   <li>Assistant messages with a stored {@link AssistantConversationMessage#getToolChain()}
 *       expand that full tool chain; otherwise the first {@link ChatPart} content is used.</li>
 * </ul>
 */
@Service
public class ConversationHistoryBuilder {

    private static final Logger log = LoggerFactory.getLogger(ConversationHistoryBuilder.class);

    /**
     * Builds the LLM history for all messages in the given conversation.
     * The current (new) user message is NOT included — it is handled separately by the caller.
     */
    public List<ChatMessage> toApiMessages(Conversation conversation) {
        log.trace("Building API messages from conversation id={}, messageCount={}",
                conversation.getId(), conversation.getMessages().size());
        List<ChatMessage> result = new ArrayList<>();
        for (ConversationMessage msg : conversation.getMessages()) {
            if (msg instanceof UserConversationMessage u) {
                String content = StringUtils.hasText(u.getResolvedContent())
                        ? u.getResolvedContent()
                        : extractFirstChatPartContent(u.getParts());
                result.add(new ChatMessage("user", content));
            } else if (msg instanceof AssistantConversationMessage a) {
                if (a.getToolChain() != null && !a.getToolChain().isEmpty()) {
                    result.addAll(a.getToolChain());
                    // Final text-only assistant response after the tool chain
                    String finalText = extractFirstChatPartContent(a.getParts());
                    if (!finalText.isEmpty()) {
                        result.add(new ChatMessage("assistant", finalText));
                    }
                } else {
                    String content = extractFirstChatPartContent(a.getParts());
                    result.add(new ChatMessage("assistant", content));
                }
            }
        }
        log.trace("Built {} API messages from conversation id={}", result.size(), conversation.getId());
        return result;
    }

    private String extractFirstChatPartContent(List<MessagePart> parts) {
        if (parts == null) return "";
        for (MessagePart part : parts) {
            if (part instanceof ChatPart cp && StringUtils.hasText(cp.getContent())) {
                return cp.getContent();
            }
        }
        return "";
    }
}
