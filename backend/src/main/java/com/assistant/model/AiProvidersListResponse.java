package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class AiProvidersListResponse {

    private List<AiProviderPublic> providers = new ArrayList<>();
    /** True when {@code app.web-search.api-key} is configured (Tavily). */
    private boolean webSearchAvailable;

    public List<AiProviderPublic> getProviders() { return providers; }
    public void setProviders(List<AiProviderPublic> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }

    public boolean isWebSearchAvailable() {
        return webSearchAvailable;
    }

    public void setWebSearchAvailable(boolean webSearchAvailable) {
        this.webSearchAvailable = webSearchAvailable;
    }
}
