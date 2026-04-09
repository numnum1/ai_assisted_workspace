package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class ChatRequest {

    private String message;
    private String activeFile;
    private String activeFieldKey;
    private String mode;
    private List<String> referencedFiles = new ArrayList<>();
    private List<ChatMessage> history = new ArrayList<>();
    /** When true the provider's reasoning model is used instead of the fast model. */
    private boolean useReasoning = false;
    /** Optional: ID of a specific LLM entry to use. Overrides the globally active LLM. */
    private String llmId;
    /**
     * Quick Chat: minimal context, plain user text, only {@code web_search} tool (no project files/wiki tools).
     */
    private boolean quickChat = false;
    /**
     * When true, no tools are sent to the LLM API and tool instructions are omitted from the system prompt.
     */
    private boolean disableTools = false;
    /**
     * Toolkit ids (e.g. {@code web}, {@code wiki}) whose tools are omitted for this request.
     */
    private List<String> disabledToolkits = new ArrayList<>();

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getActiveFile() { return activeFile; }
    public void setActiveFile(String activeFile) { this.activeFile = activeFile; }
    public String getActiveFieldKey() { return activeFieldKey; }
    public void setActiveFieldKey(String activeFieldKey) { this.activeFieldKey = activeFieldKey; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public List<String> getReferencedFiles() { return referencedFiles; }
    public void setReferencedFiles(List<String> referencedFiles) { this.referencedFiles = referencedFiles; }
    public List<ChatMessage> getHistory() { return history; }
    public void setHistory(List<ChatMessage> history) { this.history = history; }
    public boolean isUseReasoning() { return useReasoning; }
    public void setUseReasoning(boolean useReasoning) { this.useReasoning = useReasoning; }
    public String getLlmId() { return llmId; }
    public void setLlmId(String llmId) { this.llmId = llmId; }
    public boolean isQuickChat() { return quickChat; }
    public void setQuickChat(boolean quickChat) { this.quickChat = quickChat; }
    public boolean isDisableTools() { return disableTools; }
    public void setDisableTools(boolean disableTools) { this.disableTools = disableTools; }
    public List<String> getDisabledToolkits() { return disabledToolkits; }
    public void setDisabledToolkits(List<String> disabledToolkits) {
        this.disabledToolkits = disabledToolkits != null ? disabledToolkits : new ArrayList<>();
    }
}
