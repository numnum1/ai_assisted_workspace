package com.assistant.model;

import lombok.Data;

/**
 * Create/update payload for one LLM entry.
 * On PUT, leave any {@code *ApiKey} field blank to keep the existing stored key.
 */
@Data
public class AiProviderRequest {

    private String name;

    private String fastApiUrl;
    private String fastApiKey;
    private String fastModel;

    private String reasoningApiUrl;
    private String reasoningApiKey;
    private String reasoningModel;

    private Integer maxTokens;
}
