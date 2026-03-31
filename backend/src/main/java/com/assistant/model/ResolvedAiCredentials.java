package com.assistant.model;

/**
 * Effective URL, bearer token, and model id for {@link com.assistant.service.AiApiClient}.
 */
public record ResolvedAiCredentials(String apiUrl, String apiKey, String model) {
}
