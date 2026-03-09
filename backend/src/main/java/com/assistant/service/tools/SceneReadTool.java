package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads a single scene metadata file (.scene.json) by its path.
 * Only paths under chapters/ are allowed.
 * Use scene_search first to find the correct path.
 */
@Component
public class SceneReadTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(SceneReadTool.class);

    private static final String CHAPTERS_PREFIX = "chapters/";

    private final FileService fileService;

    public SceneReadTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "scene_read";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full metadata of a single scene by its .scene.json path. " +
                        "Only files under chapters/ are accessible. " +
                        "Use scene_search first to discover the correct path.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the scene metadata file (e.g. 'chapters/kapitel-07/szene-03.scene.json')"
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
        if (!normalizedPath.startsWith(CHAPTERS_PREFIX)) {
            return "Error: path must be inside chapters/ (got '" + path + "')";
        }
        if (normalizedPath.contains("..")) {
            return "Error: path traversal not allowed";
        }
        if (!normalizedPath.endsWith(".scene.json")) {
            return "Error: only .scene.json files are supported";
        }

        if (!fileService.fileExists(normalizedPath)) {
            return "File not found: " + normalizedPath;
        }

        try {
            return fileService.readFile(normalizedPath);
        } catch (IOException e) {
            log.error("Error reading scene file: {}", normalizedPath, e);
            return "Error reading scene file: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading scene metadata: " + extractArg(argsJson, "path");
    }
}
