package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Root JSON document for {@code ai-providers.json} in app data.
 * {@code activeId} points to the currently selected LLM entry.
 * Within that entry, fast vs. reasoning is chosen at request time.
 */
public class AiProvidersState {

    private String activeId;
    private List<AiProvider> providers = new ArrayList<>();

    public String getActiveId() { return activeId; }
    public void setActiveId(String activeId) { this.activeId = activeId; }

    public List<AiProvider> getProviders() { return providers; }
    public void setProviders(List<AiProvider> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }
}
