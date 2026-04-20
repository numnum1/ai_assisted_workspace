package com.assistant.ai_provider.model;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Root JSON document for {@code ai-providers.json} in app data.
 * The first entry in {@code providers} is used as fallback when no mode specifies an LLM.
 */
@Getter
@Setter
public class AiProvidersState {

    @Setter(AccessLevel.NONE)
    private List<AiProvider> providers = new ArrayList<>();

    public void setProviders(List<AiProvider> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }
}
