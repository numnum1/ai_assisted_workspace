package com.assistant.service.tools;

import com.assistant.service.WikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Reads a single wiki entry (Markdown file) from the /wiki/ directory.
 * Use wiki_search first to find the correct path.
 */
@Component
public class WikiReadTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(WikiReadTool.class);

    private final WikiService wikiService;

    public WikiReadTool(WikiService wikiService) {
        this.wikiService = wikiService;
    }

    @Override
    public String getName() {
        return "wiki_read";
    }

    @Override
    public String getToolkit() {
        return ToolkitIds.WIKI;
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a wiki entry (Markdown file in /wiki/). " +
                        "Use wiki_search first to discover the correct path.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the wiki file within /wiki/ " +
                                    "(e.g. 'characters/lupusregina.md' or 'characters/lupusregina')"
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
        if (path.contains("..")) {
            return "Error: path traversal not allowed";
        }

        log.trace("Received request to execute wiki_read for path: {}", path);
        try {
            String content = wikiService.readWikiFile(path);
            String result = wikiService.formatForAi(path, content);
            log.trace("Finished wiki_read for path: {}", path);
            return result;
        } catch (NoSuchElementException e) {
            return "Wiki file not found: '" + path + "'. Use wiki_search to find available entries.";
        } catch (IOException e) {
            log.error("Error reading wiki file: {}", path, e);
            return "Error reading wiki file: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading wiki entry: " + extractArg(argsJson, "path");
    }
}
