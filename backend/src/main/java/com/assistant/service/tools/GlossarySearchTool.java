package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Searches the project glossary directory (.glossary/) for term definitions and concepts.
 * Returns a compact hit list. Use glossary_read to retrieve full entry content.
 */
@Component
public class GlossarySearchTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(GlossarySearchTool.class);

    private static final String GLOSSARY_DIR = ".glossary";
    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 20;

    private final FileService fileService;

    public GlossarySearchTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "glossary_search";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Search the project glossary for term definitions, concepts, and other vocabulary entries. " +
                        "Returns a compact list of matching entries with their paths and summaries. " +
                        "Use glossary_read afterwards to get the full definition of a specific term. " +
                        "The glossary lives under .glossary/ in the project root.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "query", Map.of(
                            "type", "string",
                            "description", "Search term matched against entry names, aliases, tags, and summaries (case-insensitive)"
                        ),
                        "type", Map.of(
                            "type", "string",
                            "description", "Optional filter by entry type (e.g. 'term', 'concept')"
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

        String typeFilter = extractArg(argsJson, "type");
        int limit = parseLimit(extractArg(argsJson, "limit"));
        String lowerQuery = query.toLowerCase();
        String lowerType = typeFilter != null ? typeFilter.toLowerCase() : null;

        if (!fileService.isDirectory(GLOSSARY_DIR)) {
            return "Glossary directory not found. Enable the glossary feature in Project Settings to create .glossary/ in the project root.";
        }

        List<String> allFiles;
        try {
            allFiles = fileService.listFiles(GLOSSARY_DIR);
        } catch (IOException e) {
            log.error("Error listing glossary files", e);
            return "Error reading glossary directory: " + e.getMessage();
        }

        List<GlossaryHit> hits = new ArrayList<>();

        for (String path : allFiles) {
            if (!path.endsWith(".md")) continue;

            try {
                String content = fileService.readFile(path);
                GlossaryHit hit = matchEntry(path, content, lowerQuery, lowerType);
                if (hit != null) {
                    hits.add(hit);
                    if (hits.size() >= limit) break;
                }
            } catch (IOException e) {
                log.warn("Could not read glossary entry: {}", path);
            }
        }

        if (hits.isEmpty()) {
            return "No glossary entries found matching '" + query + "'" +
                    (lowerType != null ? " with type='" + typeFilter + "'" : "") + ".";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Found ").append(hits.size()).append(" glossary entry/entries matching '").append(query).append("':\n\n");
        for (GlossaryHit hit : hits) {
            sb.append("- **").append(hit.path()).append("**");
            if (hit.entryType() != null) sb.append(" [").append(hit.entryType()).append("]");
            if (hit.summary() != null) sb.append("\n  ").append(hit.summary());
            sb.append("\n");
        }
        sb.append("\nUse glossary_read with the path to get the full entry.");
        return sb.toString();
    }

    @Override
    public String describe(String argsJson) {
        String query = extractArg(argsJson, "query");
        String type = extractArg(argsJson, "type");
        if (type != null && !type.isBlank()) {
            return "Searching glossary for " + type + ": '" + query + "'";
        }
        return "Searching glossary for '" + query + "'";
    }

    private GlossaryHit matchEntry(String path, String content, String lowerQuery, String lowerType) {
        String fileName = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        String baseName = fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : fileName;

        String entryType = extractFrontmatterValue(content, "type");
        String id = extractFrontmatterValue(content, "id");
        String aliases = extractFrontmatterValue(content, "aliases");
        String tags = extractFrontmatterValue(content, "tags");
        String summary = extractFrontmatterValue(content, "summary");

        if (lowerType != null && entryType != null && !entryType.toLowerCase().contains(lowerType)) {
            return null;
        }

        boolean matches =
                baseName.toLowerCase().contains(lowerQuery) ||
                (id != null && id.toLowerCase().contains(lowerQuery)) ||
                (aliases != null && aliases.toLowerCase().contains(lowerQuery)) ||
                (tags != null && tags.toLowerCase().contains(lowerQuery)) ||
                (summary != null && summary.toLowerCase().contains(lowerQuery));

        if (!matches) return null;
        return new GlossaryHit(path, entryType, summary);
    }

    private String extractFrontmatterValue(String content, String key) {
        if (content == null || !content.startsWith("---")) return null;

        int fmEnd = content.indexOf("\n---", 3);
        String frontmatter = fmEnd > 0 ? content.substring(0, fmEnd) : content;

        String search = "\n" + key + ":";
        int idx = frontmatter.indexOf(search);
        if (idx == -1) return null;

        int lineStart = idx + search.length();
        int lineEnd = frontmatter.indexOf('\n', lineStart);
        String valuePart = lineEnd > 0
                ? frontmatter.substring(lineStart, lineEnd).trim()
                : frontmatter.substring(lineStart).trim();

        if (valuePart.equals(">") || valuePart.equals("|")) {
            if (lineEnd == -1) return null;
            int nextLineStart = lineEnd + 1;
            int nextLineEnd = frontmatter.indexOf('\n', nextLineStart);
            String nextLine = nextLineEnd > 0
                    ? frontmatter.substring(nextLineStart, nextLineEnd).trim()
                    : frontmatter.substring(nextLineStart).trim();
            return nextLine.isBlank() ? null : nextLine;
        }

        return valuePart.isBlank() ? null : valuePart;
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

    private record GlossaryHit(String path, String entryType, String summary) {}
}
