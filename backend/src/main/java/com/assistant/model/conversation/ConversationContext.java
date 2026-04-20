package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Future: assembled blocks for inspector / LLM context.
 * Currently unused; {@link Conversation#computeContext()} returns {@code null}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class ConversationContext {

    public record ContextBlock(String name, int size) {}

    @Setter(AccessLevel.NONE)
    private List<ContextBlock> blocks = new ArrayList<>();

    public void setBlocks(List<ContextBlock> blocks) {
        this.blocks = blocks != null ? blocks : new ArrayList<>();
    }
}
