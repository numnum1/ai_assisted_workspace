package com.assistant.model;

import lombok.Data;

/**
 * One LLM configuration entry.
 * Each entry carries two independent sub-configs (fast and reasoning).
 * Both sub-configs have their own API URL, API key and model.
 * The reasoning sub-config is optional — if its fields are blank the fast config is used as fallback.
 */
@Data
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
}
