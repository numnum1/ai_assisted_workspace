package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads a single planning metafile by its path. Only paths under .planning/ are allowed.
 * Use plan_search first to find the correct path, then plan_read to get the full content.
 */
@Component
public class PlanReadTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(PlanReadTool.class);

    private static final String PLANNING_PREFIX = ".planning/";

    private final FileService fileService;

    public PlanReadTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "plan_read";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a single planning metafile by its path. " +
                        "Only files under .planning/ are accessible. " +
                        "Use plan_search first to discover the correct path.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the planning metafile to read (e.g. '.planning/chapters/kapitel-03.md')"
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
        if (!normalizedPath.startsWith(PLANNING_PREFIX)) {
            return "Error: path must be inside .planning/ (got '" + path + "')";
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
            log.error("Error reading planning entry: {}", normalizedPath, e);
            return "Error reading planning entry: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading planning entry: " + extractArg(argsJson, "path");
    }
}
