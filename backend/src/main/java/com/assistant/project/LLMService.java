package com.assistant.project;

import com.assistant.ai_provider.AiProviderService;
import com.assistant.ai_provider.model.AiProvider;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service("llmService")
public class LLMService {

    private static final Logger log = LoggerFactory.getLogger(LLMService.class);

    private final LLMs llms;
    private final AiProviderService aiProviderService;

    public LLMService(LLMs llms, AiProviderService aiProviderService) {
        this.llms = llms;
        this.aiProviderService = aiProviderService;
    }

    @PostConstruct
    public void reloadLlms() {
        synchronized (llms) {
            clearRegistry();
            List<AiProvider> providers = aiProviderService.listProviders();
            if (providers.isEmpty()) {
                log.info("No persisted LLM providers found");
                return;
            }

            int loaded = 0;
            for (AiProvider provider : providers) {
                if (provider == null || provider.getId() == null || provider.getId().isBlank()) {
                    log.warn("Skipping LLM provider without valid id");
                    continue;
                }

                try {
                    llms.add(toLlmConfig(provider));
                    loaded++;
                } catch (IllegalStateException e) {
                    log.warn("Skipping invalid LLM provider id={}: {}", provider.getId(), e.getMessage());
                }
            }

            log.info("Loaded {} LLM config(s) into registry", loaded);
        }
    }

    public List<LLMConfig> getAll() {
        List<LLMConfig> result = new ArrayList<>(aiProviderService.listProviders().size());
        for (AiProvider provider : aiProviderService.listProviders()) {
            if (provider == null || provider.getId() == null || provider.getId().isBlank()) {
                continue;
            }
            try {
                result.add(toLlmConfig(provider));
            } catch (IllegalStateException ignored) {
                // Skip invalid providers in list views as well.
            }
        }
        result.sort(Comparator.comparing(LLMConfig::getName, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    public Optional<LLMConfig> find(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return llms.find(id);
    }

    public LLMConfig require(String id) {
        return find(id).orElseThrow(() -> new IllegalStateException("Missing llm with id: " + id));
    }

    private LLMConfig toLlmConfig(AiProvider provider) {
        LLMConfig config = new LLMConfig();
        config.setId(provider.getId());
        config.setName(provider.getName());

        LLMSetting fast = toFastSetting(provider);
        LLMSetting reasoning = toReasoningSetting(provider);

        if (fast == null && reasoning == null) {
            throw new IllegalStateException("LLM provider has neither fast nor reasoning model configured");
        }

        config.setFast(fast);
        config.setReasoning(reasoning);
        return config;
    }

    private LLMSetting toFastSetting(AiProvider provider) {
        String model = trimToNull(provider.getFastModel());
        String host = trimToNull(provider.getFastApiUrl());
        if (model == null && host == null) {
            return null;
        }
        return new LLMSetting(model != null ? model : "", host != null ? normalizeBaseUrl(host) : "");
    }

    private LLMSetting toReasoningSetting(AiProvider provider) {
        String model = trimToNull(provider.getReasoningModel());
        String host = trimToNull(provider.getReasoningApiUrl());
        if (model == null && host == null) {
            return null;
        }
        return new LLMSetting(model != null ? model : "", host != null ? normalizeBaseUrl(host) : "");
    }

    @SuppressWarnings("unchecked")
    private void clearRegistry() {
        try {
            var field = com.assistant.util.Repository.class.getDeclaredField("data");
            field.setAccessible(true);
            ((java.util.Map<String, LLMConfig>) field.get(llms)).clear();
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Could not clear LLM registry", e);
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeBaseUrl(String url) {
        String normalized = url.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
