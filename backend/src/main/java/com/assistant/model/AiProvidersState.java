package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Root JSON document for {@code ai-providers.json} in app data.
 * The first entry in {@code providers} is used as fallback when no mode specifies an LLM.
 */
public class AiProvidersState {

    private List<AiProvider> providers = new ArrayList<>();

    public List<AiProvider> getProviders() { return providers; }
    public void setProviders(List<AiProvider> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }
}
