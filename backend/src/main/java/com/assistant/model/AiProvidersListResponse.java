package com.assistant.model;

import java.util.ArrayList;
import java.util.List;

public class AiProvidersListResponse {

    private List<AiProviderPublic> providers = new ArrayList<>();

    public List<AiProviderPublic> getProviders() { return providers; }
    public void setProviders(List<AiProviderPublic> providers) {
        this.providers = providers != null ? providers : new ArrayList<>();
    }
}
