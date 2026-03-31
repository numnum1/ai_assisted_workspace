package com.assistant.model;

/**
 * One LLM configuration entry.
 * Each entry carries two independent sub-configs (fast and reasoning).
 * Both sub-configs have their own API URL, API key and model.
 * The reasoning sub-config is optional — if its fields are blank the fast config is used as fallback.
 */
public class AiProvider {

    private String id;
    private String name;

    // ── fast (non-reasoning) sub-config ──────────────────────────────────────────
    private String fastApiUrl;
    private String fastApiKey;
    private String fastModel;

    // ── reasoning sub-config ─────────────────────────────────────────────────────
    private String reasoningApiUrl;
    private String reasoningApiKey;
    private String reasoningModel;

    // ── context window ────────────────────────────────────────────────────────────
    private Integer maxTokens;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFastApiUrl() { return fastApiUrl; }
    public void setFastApiUrl(String fastApiUrl) { this.fastApiUrl = fastApiUrl; }

    public String getFastApiKey() { return fastApiKey; }
    public void setFastApiKey(String fastApiKey) { this.fastApiKey = fastApiKey; }

    public String getFastModel() { return fastModel; }
    public void setFastModel(String fastModel) { this.fastModel = fastModel; }

    public String getReasoningApiUrl() { return reasoningApiUrl; }
    public void setReasoningApiUrl(String reasoningApiUrl) { this.reasoningApiUrl = reasoningApiUrl; }

    public String getReasoningApiKey() { return reasoningApiKey; }
    public void setReasoningApiKey(String reasoningApiKey) { this.reasoningApiKey = reasoningApiKey; }

    public String getReasoningModel() { return reasoningModel; }
    public void setReasoningModel(String reasoningModel) { this.reasoningModel = reasoningModel; }

    public Integer getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Integer maxTokens) { this.maxTokens = maxTokens; }
}
