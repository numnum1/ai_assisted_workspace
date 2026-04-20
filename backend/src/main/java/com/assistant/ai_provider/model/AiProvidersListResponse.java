package com.assistant.ai_provider.model;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class AiProvidersListResponse {

    @Setter(AccessLevel.NONE)
    private List<AiProviderPublic> providers = new ArrayList<>();
    /** True when {@code app.web-search.api-key} is configured (Tavily). */
    private boolean webSearchAvailable;

    public void setProviders(List<AiProviderPublic> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }
}
