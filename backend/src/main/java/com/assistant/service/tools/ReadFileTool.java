package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Component
public class ReadFileTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(ReadFileTool.class);

    private final FileService fileService;

    public ReadFileTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "read_file";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a file in the project by its relative path. " +
                        "Use this after search_project to inspect a file's contents.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "The relative path of the file to read (e.g. 'characters/Marc/bio.md')"
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
        if (!fileService.fileExists(path)) {
            return "File not found: " + path;
        }
        try {
            return fileService.readFile(path);
        } catch (IOException e) {
            log.error("Error reading file: {}", path, e);
            return "Error reading file: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading file: " + extractArg(argsJson, "path");
    }
}
