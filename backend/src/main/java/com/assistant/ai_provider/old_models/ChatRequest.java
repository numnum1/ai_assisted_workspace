package com.assistant.ai_provider.old_models;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class ChatRequest {

    private String message;
    /** ID of the stored conversation; when set, the backend loads history from storage. */
    private String conversationId;
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
    @Setter(AccessLevel.NONE)
    private List<String> disabledToolkits = new ArrayList<>();
    /**
     * Chat session kind: {@code standard} (default) or {@code guided} (AI-led conversation with steering plan).
     */
    private String sessionKind = "standard";
    /**
     * Current steering plan markdown for guided sessions; injected into system prompt when non-blank.
     */
    private String steeringPlan;

    public void setDisabledToolkits(List<String> disabledToolkits) {
        this.disabledToolkits = disabledToolkits != null ? disabledToolkits : new ArrayList<>();
    }

    public void setSessionKind(String sessionKind) {
        this.sessionKind = sessionKind != null && !sessionKind.isBlank() ? sessionKind : "standard";
    }
}
