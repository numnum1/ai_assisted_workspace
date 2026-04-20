package com.assistant.ai_provider.model;

import lombok.Data;

/**
 * API-facing LLM row — keys are never exposed, only whether they are set.
 */
@Data
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
}
