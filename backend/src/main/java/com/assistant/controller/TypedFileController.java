package com.assistant.controller;

import com.assistant.model.ChatMessage;
import com.assistant.service.AiApiClient;
import com.assistant.service.ContextService;
import com.assistant.service.FileService;
import com.assistant.service.ModeService;
import com.assistant.service.TypeDefinitionService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Handles typed structured files (.scene.json, .chapter.json, etc.).
 * Provides type definitions, typed file CRUD, and AI-assisted fill.
 */
@RestController
public class TypedFileController {

    private static final Logger log = LoggerFactory.getLogger(TypedFileController.class);

    private final TypeDefinitionService typeDefinitionService;
    private final FileService fileService;
    private final AiApiClient aiApiClient;
    private final ModeService modeService;
    private final ContextService contextService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TypedFileController(TypeDefinitionService typeDefinitionService, FileService fileService,
                               AiApiClient aiApiClient, ModeService modeService,
                               ContextService contextService) {
        this.typeDefinitionService = typeDefinitionService;
        this.fileService = fileService;
        this.aiApiClient = aiApiClient;
        this.modeService = modeService;
        this.contextService = contextService;
    }

    @GetMapping("/api/types")
    public ResponseEntity<List<Map<String, Object>>> getAllTypes() {
        return ResponseEntity.ok(typeDefinitionService.getAllTypeDefinitions());
    }

    @GetMapping("/api/types/{id}")
    public ResponseEntity<?> getTypeById(@PathVariable String id) {
        return typeDefinitionService.findById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/api/typed-files/content/**")
    public ResponseEntity<?> getTypedFileContent(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/typed-files/content/");

        if (!fileService.fileExists(path)) {
            return ResponseEntity.ok(Map.of(
                "path", path,
                "data", Map.of(),
                "exists", false
            ));
        }

        String raw = fileService.readFile(path);
        Map<String, Object> data;
        try {
            data = typeDefinitionService.parseJsonToMap(raw);
        } catch (Exception e) {
            data = Map.of();
        }

        String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        String ext = typeDefinitionService.detectTypedExtension(filename);

        return ResponseEntity.ok(Map.of(
            "path", path,
            "data", data,
            "exists", true,
            "typeId", ext != null
                ? typeDefinitionService.findByExtension(ext).map(d -> d.get("id")).orElse("")
                : ""
        ));
    }

    @PutMapping("/api/typed-files/content/**")
    public ResponseEntity<?> saveTypedFileContent(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body) throws IOException {
        String path = extractPath(request, "/api/typed-files/content/");

        Object dataObj = body.get("data");
        if (dataObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing 'data' field"));
        }

        String json = typeDefinitionService.toJson(dataObj);
        fileService.writeFile(path, json);
        return ResponseEntity.ok(Map.of("status", "saved", "path", path));
    }

    /**
     * AI-assisted fill: given a typed file path, asks the AI to fill in the fields
     * based on the current project context (neighboring scenes, wiki, story.md).
     * Returns the filled data as JSON without saving.
     */
    @PostMapping("/api/typed-files/fill/**")
    public ResponseEntity<?> fillTypedFile(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/typed-files/fill/");

        String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        String ext = typeDefinitionService.detectTypedExtension(filename);
        if (ext == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Unknown file type: " + filename));
        }

        var typeDefOpt = typeDefinitionService.findByExtension(ext);
        if (typeDefOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No type definition for: " + ext));
        }

        Map<String, Object> typeDef = typeDefOpt.get();

        // Load existing data (may be empty)
        String currentData = "{}";
        if (fileService.fileExists(path)) {
            try { currentData = fileService.readFile(path); } catch (Exception ignored) {}
        }

        // Build fill prompt
        String schemaJson = typeDefinitionService.toJson(typeDef);
        String prompt = buildFillPrompt(schemaJson, currentData, path);

        // Use structure-fill mode for system prompt
        var fillMode = modeService.getMode("structure-fill");
        String systemPrompt = fillMode != null
                ? fillMode.getSystemPrompt()
                : "You are a story structure assistant. Return ONLY valid JSON.";

        // Build context: include story.md and scene neighbors via system prompt
        StringBuilder contextSb = new StringBuilder();
        contextSb.append(systemPrompt).append("\n\n");

        // Auto-inject scene context
        java.util.Set<String> includedFiles = new java.util.LinkedHashSet<>();
        injectSceneContextForFill(contextSb, path, includedFiles);

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(new ChatMessage("system", contextSb.toString()));
        messages.add(new ChatMessage("user", prompt));

        try {
            AiApiClient.ChatCompletionResult result = aiApiClient.chatWithTools(messages, null);
            String aiResponse = result.content() != null ? result.content().trim() : "{}";

            // Strip markdown code fences if present
            if (aiResponse.startsWith("```")) {
                int firstNewline = aiResponse.indexOf('\n');
                int lastFence = aiResponse.lastIndexOf("```");
                if (firstNewline > 0 && lastFence > firstNewline) {
                    aiResponse = aiResponse.substring(firstNewline + 1, lastFence).trim();
                }
            }

            Map<String, Object> filledData = objectMapper.readValue(aiResponse, new TypeReference<>() {});
            return ResponseEntity.ok(Map.of("data", filledData));
        } catch (Exception e) {
            log.error("AI fill failed for {}: {}", path, e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "AI fill failed: " + e.getMessage()));
        }
    }

    private String buildFillPrompt(String schemaJson, String currentData, String filePath) {
        return "Fill in the following structured form for: " + filePath + "\n\n" +
                "Schema:\n" + schemaJson + "\n\n" +
                "Current data (may be empty or partial):\n" + currentData + "\n\n" +
                "Based on all available context, return ONLY the filled JSON object. " +
                "Use the exact field keys from the schema. Return no other text.";
    }

    private void injectSceneContextForFill(StringBuilder sb, String activeFile, java.util.Set<String> included) {
        // Inject story.md if it exists
        if (fileService.fileExists("story.md")) {
            try {
                sb.append("=== story.md ===\n").append(fileService.readFile("story.md")).append("\n\n");
                included.add("story.md");
            } catch (Exception ignored) {}
        }

        String normalized = activeFile.replace('\\', '/');
        if (!normalized.startsWith("chapters/")) return;

        String[] parts = normalized.split("/");
        if (parts.length < 3) return;
        String chapterPath = parts[0] + "/" + parts[1];
        String chapterName = parts[1];
        String fileName = parts[2];
        String sceneName = fileName.endsWith(".scene.json")
                ? fileName.substring(0, fileName.length() - ".scene.json".length())
                : fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : null;
        if (sceneName == null) return;

        // Chapter metadata
        String chapterMeta = chapterPath + "/" + chapterName + ".chapter.json";
        injectIfExists(sb, chapterMeta, included);

        // Neighboring scenes
        try {
            java.util.List<String> files = fileService.listFiles(chapterPath);
            java.util.List<String> sceneNames = files.stream()
                    .filter(p -> p.endsWith(".md"))
                    .map(p -> { String fn = p.contains("/") ? p.substring(p.lastIndexOf('/') + 1) : p; return fn.substring(0, fn.length() - 3); })
                    .sorted().toList();
            int idx = sceneNames.indexOf(sceneName);
            if (idx > 0) injectIfExists(sb, chapterPath + "/" + sceneNames.get(idx - 1) + ".scene.json", included);
            if (idx >= 0 && idx < sceneNames.size() - 1) injectIfExists(sb, chapterPath + "/" + sceneNames.get(idx + 1) + ".scene.json", included);
        } catch (Exception ignored) {}
    }

    private void injectIfExists(StringBuilder sb, String path, java.util.Set<String> included) {
        if (included.contains(path) || !fileService.fileExists(path)) return;
        try {
            sb.append("=== ").append(path).append(" ===\n").append(fileService.readFile(path)).append("\n\n");
            included.add(path);
        } catch (Exception ignored) {}
    }

    private String extractPath(HttpServletRequest request, String prefix) {
        String uri = request.getRequestURI();
        String rawPath = uri.substring(uri.indexOf(prefix) + prefix.length());
        try {
            return URLDecoder.decode(rawPath, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return rawPath;
        }
    }
}
