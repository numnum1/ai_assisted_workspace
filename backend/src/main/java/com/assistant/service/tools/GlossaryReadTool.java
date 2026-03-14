package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads a single glossary entry by its path. Only paths under .glossary/ are allowed.
 * Use glossary_search first to find the correct path, then glossary_read to get the full content.
 */
@Component
public class GlossaryReadTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(GlossaryReadTool.class);

    private static final String GLOSSARY_PREFIX = ".glossary/";

    private final FileService fileService;

    public GlossaryReadTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "glossary_read";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a single glossary entry by its path. " +
                        "Only files under .glossary/ are accessible. " +
                        "Use glossary_search first to discover the correct path.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the glossary entry to read (e.g. '.glossary/foreshadowing.md')"
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

        String normalizedPath = path.replace('\\', '/');
        if (!normalizedPath.startsWith(GLOSSARY_PREFIX)) {
            return "Error: path must be inside .glossary/ (got '" + path + "')";
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
            log.error("Error reading glossary entry: {}", normalizedPath, e);
            return "Error reading glossary entry: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading glossary entry: " + extractArg(argsJson, "path");
    }
}
