package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class AssembledContext {

    private List<ChatMessage> messages = new ArrayList<>();
    private List<String> includedFiles = new ArrayList<>();
    private int estimatedTokens;

    public List<ChatMessage> getMessages() { return messages; }
    public void setMessages(List<ChatMessage> messages) { this.messages = messages; }
    public List<String> getIncludedFiles() { return includedFiles; }
    public void setIncludedFiles(List<String> includedFiles) { this.includedFiles = includedFiles; }
    public int getEstimatedTokens() { return estimatedTokens; }
    public void setEstimatedTokens(int estimatedTokens) { this.estimatedTokens = estimatedTokens; }
}
