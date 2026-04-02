package com.assistant.service;

import com.assistant.model.ChatMessage;
import com.assistant.model.GlossaryEntry;
import com.assistant.model.GlossaryGenerateRequest;
import com.assistant.model.GlossaryGenerateResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class GlossaryService {

    private static final Logger log = LoggerFactory.getLogger(GlossaryService.class);
    private static final String GLOSSARY_PATH = ".assistant/glossary.json";
    private static final int MAX_CONTEXT_BLOCK_CHARS = 12_000;
    private static final int MAX_CHAT_CONTEXT_CHARS = 48_000;

    private final FileService fileService;
    private final ObjectMapper objectMapper;
    private final AiApiClient aiApiClient;
    private final ProjectConfigService projectConfigService;

    public GlossaryService(
            FileService fileService,
            ObjectMapper objectMapper,
            AiApiClient aiApiClient,
            ProjectConfigService projectConfigService) {
        this.fileService = fileService;
        this.objectMapper = objectMapper;
        this.aiApiClient = aiApiClient;
        this.projectConfigService = projectConfigService;
    }

    private Path glossaryFile() {
        return fileService.getProjectRoot().resolve(GLOSSARY_PATH);
    }

    public List<GlossaryEntry> listEntries() throws IOException {
        Path p = glossaryFile();
        if (!Files.exists(p)) {
            return Collections.emptyList();
        }
        String json = Files.readString(p, StandardCharsets.UTF_8);
        if (json.isBlank()) {
            return Collections.emptyList();
        }
        return objectMapper.readValue(json, new TypeReference<>() {});
    }

    private void writeAll(List<GlossaryEntry> entries) throws IOException {
        Path p = glossaryFile();
        Files.createDirectories(p.getParent());
        Files.writeString(
                p,
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(entries),
                StandardCharsets.UTF_8);
    }

    public GlossaryEntry addEntry(GlossaryEntry incoming) throws IOException {
        log.trace("Received request to add glossary entry: term={}", incoming != null ? incoming.getTerm() : null);
        if (incoming == null || trimOrEmpty(incoming.getTerm()).isEmpty() || trimOrEmpty(incoming.getDefinition()).isEmpty()) {
            throw new IllegalArgumentException("term and definition are required");
        }
        List<GlossaryEntry> list = new ArrayList<>(listEntries());
        String id =
                incoming.getId() != null && !incoming.getId().isBlank()
                        ? incoming.getId()
                        : UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        GlossaryEntry e = new GlossaryEntry(
                id,
                trimOrEmpty(incoming.getTerm()),
                trimOrEmpty(incoming.getDefinition()),
                incoming.getCreatedAt() > 0 ? incoming.getCreatedAt() : now);
        list.add(e);
        writeAll(list);
        log.trace("Finished add glossary entry successfully: id={}, term={}", e.getId(), e.getTerm());
        return e;
    }

    public GlossaryEntry updateEntry(String id, GlossaryEntry incoming) throws IOException {
        log.trace("Received request to update glossary entry: id={}", id);
        if (incoming == null || trimOrEmpty(incoming.getTerm()).isEmpty() || trimOrEmpty(incoming.getDefinition()).isEmpty()) {
            throw new IllegalArgumentException("term and definition are required");
        }
        List<GlossaryEntry> list = new ArrayList<>(listEntries());
        GlossaryEntry updated = null;
        for (GlossaryEntry cur : list) {
            if (id.equals(cur.getId())) {
                cur.setTerm(trimOrEmpty(incoming.getTerm()));
                cur.setDefinition(trimOrEmpty(incoming.getDefinition()));
                updated = cur;
                break;
            }
        }
        if (updated == null) {
            log.trace("Glossary update: id not found {}", id);
            throw new NoSuchElementException("Glossary entry not found: " + id);
        }
        writeAll(list);
        log.trace("Finished update glossary entry successfully: id={}", id);
        return updated;
    }

    public void deleteEntry(String id) throws IOException {
        log.trace("Received request to delete glossary entry: id={}", id);
        List<GlossaryEntry> list = new ArrayList<>(listEntries());
        boolean removed = list.removeIf(e -> id.equals(e.getId()));
        if (!removed) {
            log.trace("Glossary delete: id not found {}", id);
            throw new NoSuchElementException("Glossary entry not found: " + id);
        }
        writeAll(list);
        log.trace("Finished delete glossary entry successfully: id={}", id);
    }

    public GlossaryGenerateResult generateDefinition(GlossaryGenerateRequest req) throws IOException {
        log.trace("Received request to generate glossary definition for term={}", req != null ? req.getTerm() : null);
        if (req == null || trimOrEmpty(req.getTerm()).isEmpty()) {
            throw new IllegalArgumentException("term is required");
        }
        String term = trimOrEmpty(req.getTerm());
        String llmId = "";
        if (projectConfigService.hasProjectConfig()) {
            String g = projectConfigService.getConfig().getGlossaryLlmId();
            llmId = g != null ? g : "";
        }
        String llmForCall = llmId.isBlank() ? null : llmId;

        StringBuilder userContent = new StringBuilder();
        userContent.append("Der Begriff lautet: \"").append(term).append("\"\n\n");
        String ctx = req.getChatContext();
        if (ctx != null && !ctx.isBlank()) {
            String trimmed = ctx.trim();
            userContent.append("Kontext aus dem bisherigen Chat:\n---\n");
            int end = Math.min(trimmed.length(), MAX_CHAT_CONTEXT_CHARS);
            userContent.append(trimmed, 0, end);
            userContent.append("\n---\n\n");
        }
        userContent.append(
                "Erstelle einen präzisen Glossareintrag. Antworte NUR mit einem einzelnen JSON-Objekt (kein Markdown, keine Codefences), "
                        + "exakt dieses Schema: {\"term\":\"<Kurzbegriff auf Deutsch>\",\"definition\":\"<2-4 Sätze Erklärung auf Deutsch>\"}. "
                        + "Der Begriff soll konsistent mit dem Kontext sein; wenn der Kontext leer ist, definiere den Begriff sachlich.");

        List<ChatMessage> messages =
                List.of(
                        new ChatMessage("system", "Du bist ein Assistent für Autoren. Du gibst nur gültiges JSON zurück."),
                        new ChatMessage("user", userContent.toString()));

        String raw;
        try {
            raw = aiApiClient.chat(messages, llmForCall, false);
        } catch (Throwable e) {
            log.error("Glossary generate LLM call failed", e);
            throw e;
        }
        GlossaryGenerateResult parsed = parseGenerateJson(raw, term);
        log.trace("Finished generate glossary definition successfully for term={}", parsed.getTerm());
        return parsed;
    }

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private GlossaryGenerateResult parseGenerateJson(String raw, String fallbackTerm) throws IOException {
        String cleaned = stripCodeFences(raw);
        JsonNode node = objectMapper.readTree(cleaned);
        String t = node.hasNonNull("term") ? node.get("term").asText().trim() : fallbackTerm;
        String d = node.hasNonNull("definition") ? node.get("definition").asText().trim() : "";
        if (d.isEmpty()) {
            throw new IllegalStateException("Model returned empty definition");
        }
        return new GlossaryGenerateResult(t.isEmpty() ? fallbackTerm : t, d);
    }

    private static String stripCodeFences(String s) {
        String t = s.trim();
        if (t.startsWith("```")) {
            int firstNl = t.indexOf('\n');
            if (firstNl > 0) {
                t = t.substring(firstNl + 1);
            }
            int fence = t.lastIndexOf("```");
            if (fence >= 0) {
                t = t.substring(0, fence).trim();
            }
        }
        return t;
    }

    /**
     * Plain-text block for the chat system prompt. Returns null if no glossary.
     */
    public String buildContextBlock() throws IOException {
        List<GlossaryEntry> entries = listEntries();
        if (entries.isEmpty()) {
            return null;
        }
        entries.sort(
                Comparator.comparing(e -> e.getTerm() != null ? e.getTerm().toLowerCase(Locale.ROOT) : ""));
        StringBuilder sb = new StringBuilder();
        sb.append("=== Project glossary (use these definitions consistently in this project) ===\n");
        for (GlossaryEntry e : entries) {
            String line =
                    "- **" + escapeForPrompt(e.getTerm()) + "** — " + escapeForPrompt(e.getDefinition()) + "\n";
            if (sb.length() + line.length() > MAX_CONTEXT_BLOCK_CHARS) {
                sb.append("\n[Further glossary entries omitted to save context tokens]\n");
                break;
            }
            sb.append(line);
        }
        return sb.toString();
    }

    private static String escapeForPrompt(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\n", " ").trim();
    }
}
