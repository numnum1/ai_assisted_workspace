package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class AiProviderService {

    private static final Logger log = LoggerFactory.getLogger(AiProviderService.class);
    private static final String FILE_NAME = "ai-providers.json";

    private final ProjectConfigService projectConfigService;
    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;

    private final Object lock = new Object();

    public AiProviderService(
            ProjectConfigService projectConfigService,
            AppConfig appConfig,
            ObjectMapper objectMapper) {
        this.projectConfigService = projectConfigService;
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
    }

    private Path storeFile() {
        return projectConfigService.getAppDataDirectory().resolve(FILE_NAME);
    }

    /**
     * Credentials for AI HTTP calls from the active LLM entry.
     * If {@code useReasoning} is true the reasoning sub-config is used;
     * falls back to the fast sub-config when the reasoning fields are blank.
     * Falls back to {@link AppConfig.Ai} when no entries are configured.
     */
    public ResolvedAiCredentials getActiveResolved(boolean useReasoning) {
        AiProvidersState state = loadState();
        if (state.getProviders() == null || state.getProviders().isEmpty()) {
            return credentialsFromAppConfig();
        }
        AiProvider chosen = resolveActive(state);
        if (chosen == null) {
            return credentialsFromAppConfig();
        }
        if (useReasoning) {
            ResolvedAiCredentials reasoning = extractReasoning(chosen);
            if (reasoning != null) return reasoning;
        }
        ResolvedAiCredentials fast = extractFast(chosen);
        return fast != null ? fast : credentialsFromAppConfig();
    }

    /** Convenience overload — defaults to fast sub-config. */
    public ResolvedAiCredentials getActiveResolved() {
        return getActiveResolved(false);
    }

    private ResolvedAiCredentials extractFast(AiProvider p) {
        String url = normalizeBaseUrl(p.getFastApiUrl());
        String model = nullToEmpty(p.getFastModel());
        if (url.isBlank() && model.isBlank()) return null;
        return new ResolvedAiCredentials(url, nullToEmpty(p.getFastApiKey()), model);
    }

    private ResolvedAiCredentials extractReasoning(AiProvider p) {
        String url = normalizeBaseUrl(p.getReasoningApiUrl());
        String model = nullToEmpty(p.getReasoningModel());
        if (url.isBlank() && model.isBlank()) return null;
        // use fast URL/key if reasoning URL is absent but model is set
        String effectiveUrl = url.isBlank() ? normalizeBaseUrl(p.getFastApiUrl()) : url;
        String key = (p.getReasoningApiKey() != null && !p.getReasoningApiKey().isBlank())
                ? p.getReasoningApiKey()
                : nullToEmpty(p.getFastApiKey());
        return new ResolvedAiCredentials(effectiveUrl, key, model);
    }

    private ResolvedAiCredentials credentialsFromAppConfig() {
        AppConfig.Ai ai = appConfig.getAi();
        return new ResolvedAiCredentials(
                normalizeBaseUrl(ai.getApiUrl()),
                nullToEmpty(ai.getApiKey()),
                nullToEmpty(ai.getModel()));
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────────

    public AiProvidersListResponse listPublic() {
        AiProvidersState state = loadState();
        AiProvidersListResponse out = new AiProvidersListResponse();
        out.setActiveId(state.getActiveId());
        List<AiProviderPublic> rows = new ArrayList<>();
        for (AiProvider p : state.getProviders()) {
            rows.add(toPublic(p));
        }
        out.setProviders(rows);
        return out;
    }

    public AiProviderPublic create(AiProviderRequest req) throws IOException {
        validateCreate(req);
        synchronized (lock) {
            AiProvidersState state = loadState();
            AiProvider p = new AiProvider();
            p.setId(UUID.randomUUID().toString());
            applyRequest(req, p, true);
            state.getProviders().add(p);
            if (state.getActiveId() == null || state.getActiveId().isBlank()) {
                state.setActiveId(p.getId());
            }
            saveState(state);
            return toPublic(p);
        }
    }

    public AiProviderPublic update(String id, AiProviderRequest req) throws IOException {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id required");
        synchronized (lock) {
            AiProvidersState state = loadState();
            AiProvider existing = findById(state, id);
            if (existing == null) throw new IllegalArgumentException("Unknown LLM id: " + id);
            applyRequest(req, existing, false);
            saveState(state);
            return toPublic(existing);
        }
    }

    public void delete(String id) throws IOException {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id required");
        synchronized (lock) {
            AiProvidersState state = loadState();
            boolean removed = state.getProviders().removeIf(p -> id.equals(p.getId()));
            if (!removed) throw new IllegalArgumentException("Unknown LLM id: " + id);
            if (id.equals(state.getActiveId())) {
                state.setActiveId(state.getProviders().isEmpty() ? null : state.getProviders().get(0).getId());
            }
            saveState(state);
        }
    }

    public void activate(String id) throws IOException {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id required");
        synchronized (lock) {
            AiProvidersState state = loadState();
            if (findById(state, id) == null) throw new IllegalArgumentException("Unknown LLM id: " + id);
            state.setActiveId(id);
            saveState(state);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private void applyRequest(AiProviderRequest req, AiProvider p, boolean isCreate) {
        if (req.getName() != null && !req.getName().isBlank()) {
            p.setName(req.getName().trim());
        }
        // fast sub-config
        if (req.getFastApiUrl() != null) p.setFastApiUrl(req.getFastApiUrl().trim());
        if (req.getFastModel() != null) p.setFastModel(req.getFastModel().trim());
        if (req.getFastApiKey() != null && !req.getFastApiKey().isBlank()) {
            p.setFastApiKey(req.getFastApiKey());
        } else if (isCreate) {
            p.setFastApiKey("");
        }
        // reasoning sub-config
        if (req.getReasoningApiUrl() != null) p.setReasoningApiUrl(req.getReasoningApiUrl().trim());
        if (req.getReasoningModel() != null) p.setReasoningModel(req.getReasoningModel().trim());
        if (req.getReasoningApiKey() != null && !req.getReasoningApiKey().isBlank()) {
            p.setReasoningApiKey(req.getReasoningApiKey());
        } else if (isCreate) {
            p.setReasoningApiKey("");
        }
    }

    private void validateCreate(AiProviderRequest req) {
        if (req == null) throw new IllegalArgumentException("body required");
        if (req.getName() == null || req.getName().isBlank()) throw new IllegalArgumentException("name required");
        boolean hasFast = (req.getFastApiUrl() != null && !req.getFastApiUrl().isBlank())
                || (req.getFastModel() != null && !req.getFastModel().isBlank());
        if (!hasFast) throw new IllegalArgumentException("fastApiUrl and fastModel are required");
    }

    private AiProvider resolveActive(AiProvidersState state) {
        String activeId = state.getActiveId();
        if (activeId != null && !activeId.isBlank()) {
            AiProvider byActive = findById(state, activeId);
            if (byActive != null) return byActive;
        }
        return state.getProviders().isEmpty() ? null : state.getProviders().get(0);
    }

    private AiProvider findById(AiProvidersState state, String id) {
        if (id == null || id.isBlank()) return null;
        for (AiProvider p : state.getProviders()) {
            if (id.equals(p.getId())) return p;
        }
        return null;
    }

    private AiProviderPublic toPublic(AiProvider p) {
        AiProviderPublic pub = new AiProviderPublic();
        pub.setId(p.getId());
        pub.setName(p.getName());
        pub.setFastApiUrl(p.getFastApiUrl());
        pub.setFastModel(p.getFastModel());
        pub.setFastApiKeySet(p.getFastApiKey() != null && !p.getFastApiKey().isBlank());
        pub.setReasoningApiUrl(p.getReasoningApiUrl());
        pub.setReasoningModel(p.getReasoningModel());
        pub.setReasoningApiKeySet(p.getReasoningApiKey() != null && !p.getReasoningApiKey().isBlank());
        return pub;
    }

    private AiProvidersState loadState() {
        synchronized (lock) {
            Path path = storeFile();
            if (!Files.isRegularFile(path)) return new AiProvidersState();
            try {
                String json = Files.readString(path, StandardCharsets.UTF_8);
                if (json.isBlank()) return new AiProvidersState();
                AiProvidersState state = objectMapper.readValue(json, AiProvidersState.class);
                if (state.getProviders() == null) state.setProviders(new ArrayList<>());
                return state;
            } catch (Exception e) {
                log.warn("Could not read {}: {}", path, e.getMessage());
                return new AiProvidersState();
            }
        }
    }

    private void saveState(AiProvidersState state) throws IOException {
        Path path = storeFile();
        Files.createDirectories(path.getParent());
        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(state);
        Files.writeString(path, json, StandardCharsets.UTF_8);
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }

    private static String normalizeBaseUrl(String url) {
        if (url == null || url.isBlank()) return "";
        String t = url.trim();
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }
}
