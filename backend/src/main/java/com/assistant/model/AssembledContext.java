package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class AssembledContext {

    public record ContextBlock(String type, String label, String content, int estimatedTokens) {}

    private List<ChatMessage> messages = new ArrayList<>();
    private List<String> includedFiles = new ArrayList<>();
    private int estimatedTokens;
    private List<ContextBlock> contextBlocks = new ArrayList<>();

    public List<ChatMessage> getMessages() { return messages; }
    public void setMessages(List<ChatMessage> messages) { this.messages = messages; }
    public List<String> getIncludedFiles() { return includedFiles; }
    public void setIncludedFiles(List<String> includedFiles) { this.includedFiles = includedFiles; }
    public int getEstimatedTokens() { return estimatedTokens; }
    public void setEstimatedTokens(int estimatedTokens) { this.estimatedTokens = estimatedTokens; }
    public List<ContextBlock> getContextBlocks() { return contextBlocks; }
    public void setContextBlocks(List<ContextBlock> contextBlocks) { this.contextBlocks = contextBlocks; }
}
