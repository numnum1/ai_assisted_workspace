package com.assistant.model;

/**
 * Create/update payload for one LLM entry.
 * On PUT, leave any {@code *ApiKey} field blank to keep the existing stored key.
 */
public class AiProviderRequest {

    private String name;

    private String fastApiUrl;
    private String fastApiKey;
    private String fastModel;

    private String reasoningApiUrl;
    private String reasoningApiKey;
    private String reasoningModel;

    private Integer maxTokens;

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
