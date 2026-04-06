package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads a single glossary entry by path. Only paths under .glossary/ are allowed.
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
                            "description", "Relative path of the glossary entry (e.g. '.glossary/term.md')"
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
        log.info("glossary_read: path={}", path);
        if (path == null || path.isBlank()) {
            log.warn("glossary_read: missing path");
            return "Error: missing 'path' parameter";
        }

        String normalizedPath = path.replace('\\', '/');
        if (!normalizedPath.startsWith(GLOSSARY_PREFIX)) {
            log.warn("glossary_read: path outside .glossary/: {}", path);
            return "Error: path must be inside .glossary/ (got '" + path + "')";
        }
        if (normalizedPath.contains("..")) {
            return "Error: path traversal not allowed";
        }
        if (!normalizedPath.endsWith(".md")) {
            return "Error: only .md files are supported";
        }

        if (!fileService.fileExists(normalizedPath)) {
            log.warn("glossary_read: file not found: {}", normalizedPath);
            return "File not found: " + normalizedPath;
        }

        try {
            String content = fileService.readFile(normalizedPath);
            log.info("glossary_read: success, {} chars", content != null ? content.length() : 0);
            return content;
        } catch (IOException e) {
            log.error("glossary_read: read failed for {}", normalizedPath, e);
            return "Error reading glossary entry: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading glossary entry: " + extractArg(argsJson, "path");
    }
}
