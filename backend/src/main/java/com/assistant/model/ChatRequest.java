package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class ChatRequest {

    private String message;
    private String activeFile;
    private String mode;
    private List<String> referencedFiles = new ArrayList<>();
    private List<ChatMessage> history = new ArrayList<>();
    /** When true the provider's reasoning model is used instead of the fast model. */
    private boolean useReasoning = false;

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getActiveFile() { return activeFile; }
    public void setActiveFile(String activeFile) { this.activeFile = activeFile; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public List<String> getReferencedFiles() { return referencedFiles; }
    public void setReferencedFiles(List<String> referencedFiles) { this.referencedFiles = referencedFiles; }
    public List<ChatMessage> getHistory() { return history; }
    public void setHistory(List<ChatMessage> history) { this.history = history; }
    public boolean isUseReasoning() { return useReasoning; }
    public void setUseReasoning(boolean useReasoning) { this.useReasoning = useReasoning; }
}
