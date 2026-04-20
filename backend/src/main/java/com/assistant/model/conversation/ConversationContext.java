package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * Future: assembled blocks for inspector / LLM context.
 * Currently unused; {@link Conversation#computeContext()} returns {@code null}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ConversationContext {

    public record ContextBlock(String name, int size) {}

    private List<ContextBlock> blocks = new ArrayList<>();

    public List<ContextBlock> getBlocks() {
        return blocks;
    }

    public void setBlocks(List<ContextBlock> blocks) {
        this.blocks = blocks != null ? blocks : new ArrayList<>();
    }
}
