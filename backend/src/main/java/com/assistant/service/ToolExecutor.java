package com.assistant.service;

import com.assistant.model.ToolCall;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Service
public class ToolExecutor {

    private static final Logger log = LoggerFactory.getLogger(ToolExecutor.class);

    private final FileService fileService;

    public ToolExecutor(FileService fileService) {
        this.fileService = fileService;
    }

    /**
     * Tool definitions in the OpenAI function-calling schema format.
     */
    public static List<Map<String, Object>> getToolDefinitions() {
        return List.of(
            Map.of(
                "type", "function",
                "function", Map.of(
                    "name", "search_project",
                    "description", "Search for files and folders in the project by name or path. " +
                            "Returns matching file/folder paths. Use this to find relevant project files " +
                            "when discussing characters, locations, plot elements, or any topic that might " +
                            "have corresponding files in the project structure.",
                    "parameters", Map.of(
                        "type", "object",
                        "properties", Map.of(
                            "query", Map.of(
                                "type", "string",
                                "description", "The search term to look for in file and folder names/paths (case-insensitive)"
                            )
                        ),
                        "required", List.of("query")
                    )
                )
            ),
            Map.of(
                "type", "function",
                "function", Map.of(
                    "name", "read_file",
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
            )
        );
    }

    /**
     * Execute a tool call and return the result as a string.
     */
    public String execute(ToolCall toolCall) {
        String name = toolCall.getFunction().getName();
        String args = toolCall.getFunction().getArguments();

        return switch (name) {
            case "search_project" -> executeSearch(args);
            case "read_file" -> executeReadFile(args);
            default -> "Unknown tool: " + name;
        };
    }

    /**
     * Returns a human-readable description of what the tool call is doing.
     */
    public String describeToolCall(ToolCall toolCall) {
        String name = toolCall.getFunction().getName();
        String args = toolCall.getFunction().getArguments();

        return switch (name) {
            case "search_project" -> "Searching project for '" + extractJsonString(args, "query") + "'";
            case "read_file" -> "Reading file: " + extractJsonString(args, "path");
            default -> "Running: " + name;
        };
    }

    private String executeSearch(String argsJson) {
        String query = extractJsonString(argsJson, "query");
        if (query == null || query.isBlank()) {
            return "Error: missing 'query' parameter";
        }
        try {
            List<String> results = fileService.searchFiles(query);
            if (results.isEmpty()) {
                return "No files or folders matching '" + query + "' found in the project.";
            }
            StringBuilder sb = new StringBuilder("Found " + results.size() + " result(s):\n");
            for (String path : results) {
                sb.append("  ").append(path).append("\n");
            }
            return sb.toString();
        } catch (IOException e) {
            log.error("Error searching files for query: {}", query, e);
            return "Error searching files: " + e.getMessage();
        }
    }

    private String executeReadFile(String argsJson) {
        String path = extractJsonString(argsJson, "path");
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

    /**
     * Minimal JSON string value extractor — avoids pulling in a JSON library
     * for a simple {"key": "value"} structure.
     */
    static String extractJsonString(String json, String key) {
        if (json == null) return null;
        String search = "\"" + key + "\"";
        int keyIdx = json.indexOf(search);
        if (keyIdx == -1) return null;
        int colonIdx = json.indexOf(':', keyIdx + search.length());
        if (colonIdx == -1) return null;
        int startQuote = json.indexOf('"', colonIdx + 1);
        if (startQuote == -1) return null;
        int endQuote = findClosingQuote(json, startQuote + 1);
        if (endQuote == -1) return null;
        return json.substring(startQuote + 1, endQuote)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
                .replace("\\n", "\n")
                .replace("\\t", "\t");
    }

    private static int findClosingQuote(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (s.charAt(i) == '\\') {
                i++;
            } else if (s.charAt(i) == '"') {
                return i;
            }
        }
        return -1;
    }
}
