package com.assistant.service.tools;

import com.assistant.service.FileService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Searches scene metadata files (.scene.json) under chapters/.
 * Returns a compact hit list. Use scene_read to get the full metadata of a specific scene.
 */
@Component
public class SceneSearchTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(SceneSearchTool.class);

    private static final String CHAPTERS_DIR = "chapters";
    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 20;

    private final FileService fileService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SceneSearchTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "scene_search";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Search scene metadata (.scene.json files) under chapters/. " +
                        "Returns a compact list of matching scenes with their summaries. " +
                        "Use scene_read to get the full metadata of a specific scene. " +
                        "Scenes live under chapters/<chapter-name>/<scene-name>.scene.json.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "query", Map.of(
                            "type", "string",
                            "description", "Search term matched against scene summary, characters, plot strands, and scene name (case-insensitive)"
                        ),
                        "chapter", Map.of(
                            "type", "string",
                            "description", "Optional: filter by chapter name or path (e.g. 'kapitel-07')"
                        ),
                        "limit", Map.of(
                            "type", "string",
                            "description", "Maximum number of results to return (default: 10, max: 20)"
                        )
                    ),
                    "required", List.of("query")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String query = extractArg(argsJson, "query");
        if (query == null || query.isBlank()) {
            return "Error: missing 'query' parameter";
        }

        String chapterFilter = extractArg(argsJson, "chapter");
        int limit = parseLimit(extractArg(argsJson, "limit"));
        String lowerQuery = query.toLowerCase();
        String lowerChapter = chapterFilter != null ? chapterFilter.toLowerCase() : null;

        if (!fileService.isDirectory(CHAPTERS_DIR)) {
            return "chapters/ directory not found. Create chapters/ in the project root and add chapter folders there.";
        }

        List<String> allFiles;
        try {
            allFiles = fileService.listFiles(CHAPTERS_DIR);
        } catch (IOException e) {
            log.error("Error listing chapters files", e);
            return "Error reading chapters directory: " + e.getMessage();
        }

        List<SceneHit> hits = new ArrayList<>();

        for (String path : allFiles) {
            if (!path.endsWith(".scene.json")) continue;

            // Chapter filter
            if (lowerChapter != null && !path.toLowerCase().contains(lowerChapter)) continue;

            try {
                String content = fileService.readFile(path);
                SceneHit hit = matchScene(path, content, lowerQuery);
                if (hit != null) {
                    hits.add(hit);
                    if (hits.size() >= limit) break;
                }
            } catch (IOException e) {
                log.warn("Could not read scene file: {}", path);
            }
        }

        if (hits.isEmpty()) {
            return "No scenes found matching '" + query + "'" +
                    (lowerChapter != null ? " in chapter '" + chapterFilter + "'" : "") + ".";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Found ").append(hits.size()).append(" scene(s) matching '").append(query).append("':\n\n");
        for (SceneHit hit : hits) {
            sb.append("- **").append(hit.path()).append("**");
            if (hit.summary() != null) sb.append("\n  ").append(hit.summary());
            if (hit.plotstraenge() != null) sb.append("\n  Plotstränge: ").append(hit.plotstraenge());
            sb.append("\n");
        }
        sb.append("\nUse scene_read with the path to get the full scene metadata.");
        return sb.toString();
    }

    @Override
    public String describe(String argsJson) {
        String query = extractArg(argsJson, "query");
        String chapter = extractArg(argsJson, "chapter");
        if (chapter != null && !chapter.isBlank()) {
            return "Searching scenes in '" + chapter + "' for '" + query + "'";
        }
        return "Searching scenes for '" + query + "'";
    }

    private SceneHit matchScene(String path, String content, String lowerQuery) {
        String fileName = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        String baseName = fileName.endsWith(".scene.json")
                ? fileName.substring(0, fileName.length() - ".scene.json".length())
                : fileName;

        Map<String, Object> data;
        try {
            data = objectMapper.readValue(content, new TypeReference<>() {});
        } catch (Exception e) {
            data = Map.of();
        }

        String summary = getString(data, "summary");
        String plotstraenge = getString(data, "plotstraenge");
        String charaktere = extractCharaktereFromHandlungseinheiten(data);

        boolean matches =
                baseName.toLowerCase().contains(lowerQuery) ||
                (summary != null && summary.toLowerCase().contains(lowerQuery)) ||
                (plotstraenge != null && plotstraenge.toLowerCase().contains(lowerQuery)) ||
                (charaktere != null && charaktere.toLowerCase().contains(lowerQuery));

        if (!matches) return null;
        return new SceneHit(path, summary, plotstraenge);
    }

    @SuppressWarnings("unchecked")
    private String extractCharaktereFromHandlungseinheiten(Map<String, Object> data) {
        Object units = data.get("handlungseinheiten");
        if (!(units instanceof List<?> list)) return null;

        StringBuilder sb = new StringBuilder();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Object chars = ((Map<String, Object>) map).get("charaktere");
                if (chars instanceof String s && !s.isBlank()) {
                    if (!sb.isEmpty()) sb.append(", ");
                    sb.append(s);
                }
            }
        }
        return sb.isEmpty() ? null : sb.toString();
    }

    private String getString(Map<String, Object> data, String key) {
        Object val = data.get(key);
        return val instanceof String s ? s : null;
    }

    private int parseLimit(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_LIMIT;
        try {
            int n = Integer.parseInt(raw.trim());
            return Math.min(Math.max(1, n), MAX_LIMIT);
        } catch (NumberFormatException e) {
            return DEFAULT_LIMIT;
        }
    }

    private record SceneHit(String path, String summary, String plotstraenge) {}
}
