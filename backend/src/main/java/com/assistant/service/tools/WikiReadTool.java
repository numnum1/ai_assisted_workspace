package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads a single wiki entry by its path. Only paths under wiki/ are allowed.
 * Use wiki_search first to find the correct path, then wiki_read to get the full content.
 */
@Component
public class WikiReadTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(WikiReadTool.class);

    private static final String WIKI_PREFIX = "wiki/";

    private final FileService fileService;

    public WikiReadTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "wiki_read";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a single wiki entry by its path. " +
                        "Only files under wiki/ are accessible. " +
                        "Use wiki_search first to discover the correct path.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the wiki entry to read (e.g. 'wiki/characters/mara-voss.md')"
                        )
                    ),
                    "required", List.of("path")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String path = extractArg(argsJson, "path");
        if (path == null || path.isBlank()) {
            return "Error: missing 'path' parameter";
        }

        // Normalize separators and guard against path traversal
        String normalizedPath = path.replace('\\', '/');
        if (!normalizedPath.startsWith(WIKI_PREFIX)) {
            return "Error: path must be inside wiki/ (got '" + path + "')";
        }
        if (normalizedPath.contains("..")) {
            return "Error: path traversal not allowed";
        }
        if (!normalizedPath.endsWith(".md")) {
            return "Error: only .md files are supported";
        }

        if (!fileService.fileExists(normalizedPath)) {
            return "File not found: " + normalizedPath;
        }

        try {
            return fileService.readFile(normalizedPath);
        } catch (IOException e) {
            log.error("Error reading wiki entry: {}", normalizedPath, e);
            return "Error reading wiki entry: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading wiki entry: " + extractArg(argsJson, "path");
    }
}
