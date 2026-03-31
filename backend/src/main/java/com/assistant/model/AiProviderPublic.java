package com.assistant.model;

/**
 * API-facing LLM row — keys are never exposed, only whether they are set.
 */
public class AiProviderPublic {

    private String id;
    private String name;

    private String fastApiUrl;
    private String fastModel;
    private boolean fastApiKeySet;

    private String reasoningApiUrl;
    private String reasoningModel;
    private boolean reasoningApiKeySet;

    private Integer maxTokens;

    public AiProviderPublic() {
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFastApiUrl() { return fastApiUrl; }
    public void setFastApiUrl(String fastApiUrl) { this.fastApiUrl = fastApiUrl; }

    public String getFastModel() { return fastModel; }
    public void setFastModel(String fastModel) { this.fastModel = fastModel; }

    public boolean isFastApiKeySet() { return fastApiKeySet; }
    public void setFastApiKeySet(boolean fastApiKeySet) { this.fastApiKeySet = fastApiKeySet; }

    public String getReasoningApiUrl() { return reasoningApiUrl; }
    public void setReasoningApiUrl(String reasoningApiUrl) { this.reasoningApiUrl = reasoningApiUrl; }

    public String getReasoningModel() { return reasoningModel; }
    public void setReasoningModel(String reasoningModel) { this.reasoningModel = reasoningModel; }

    public boolean isReasoningApiKeySet() { return reasoningApiKeySet; }
    public void setReasoningApiKeySet(boolean reasoningApiKeySet) { this.reasoningApiKeySet = reasoningApiKeySet; }

    public Integer getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Integer maxTokens) { this.maxTokens = maxTokens; }
}
