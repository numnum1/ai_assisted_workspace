package com.assistant.ai_provider;

/**
 * Effective URL, bearer token, and model id for {@link AiApiClient}.
 */
public record ResolvedAiCredentials(String apiUrl, String apiKey, String model) {
}
