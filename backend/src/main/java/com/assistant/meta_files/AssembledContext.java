package com.assistant.meta_files;

import com.assistant.ai_provider.old_models.ChatMessage;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AssembledContext {

    public record ContextBlock(String type, String label, String content, int estimatedTokens) {}

    private List<ChatMessage> messages = new ArrayList<>();
    private List<String> includedFiles = new ArrayList<>();
    private int estimatedTokens;
    private List<ContextBlock> contextBlocks = new ArrayList<>();
}
