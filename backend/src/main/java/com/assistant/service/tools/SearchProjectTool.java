package com.assistant.service.tools;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Component
public class SearchProjectTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(SearchProjectTool.class);

    private final FileService fileService;

    public SearchProjectTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "search_project";
    }

    @Override
    public String getToolkit() {
        return ToolkitIds.DATEISYSTEM;
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
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
        );
    }

    @Override
    public String execute(String argsJson) {
        String query = extractArg(argsJson, "query");
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

    @Override
    public String describe(String argsJson) {
        return "Searching project for '" + extractArg(argsJson, "query") + "'";
    }
}
