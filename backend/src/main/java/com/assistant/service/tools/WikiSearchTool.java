package com.assistant.service.tools;

import com.assistant.service.WikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Searches wiki entries (Markdown files in /wiki/) by filename and content.
 * Returns a list of matching file paths with snippets.
 * Use wiki_read to retrieve the full content of a specific entry.
 */
@Component
public class WikiSearchTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(WikiSearchTool.class);

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 20;

    private final WikiService wikiService;

    public WikiSearchTool(WikiService wikiService) {
        this.wikiService = wikiService;
    }

    @Override
    public String getName() {
        return "wiki_search";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Search wiki entries (Markdown files in /wiki/) by filename and content. " +
                        "Returns matching file paths and snippets. Use wiki_read to get the full content.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "query", Map.of(
                            "type", "string",
                            "description", "Search term matched against filenames and content (case-insensitive)"
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

        int limit = parseLimit(extractArg(argsJson, "limit"));
        log.trace("Received request to execute wiki_search for query: {}", query);

        List<WikiService.WikiSearchHit> hits;
        try {
            hits = wikiService.searchWiki(query, limit);
        } catch (IOException e) {
            log.error("Error searching wiki", e);
            return "Error searching wiki: " + e.getMessage();
        }

        if (hits.isEmpty()) {
            return "No wiki entries found matching '" + query + "'.";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Found ").append(hits.size()).append(" wiki entries matching '").append(query).append("':\n\n");
        for (WikiService.WikiSearchHit hit : hits) {
            sb.append("- **wiki/").append(hit.path()).append("**");
            if (!hit.title().equals(hit.path())) {
                sb.append(" — ").append(hit.title());
            }
            if (!hit.snippet().isEmpty()) {
                sb.append("\n  ").append(hit.snippet());
            }
            sb.append("\n");
        }
        sb.append("\nUse wiki_read with the path to get the full entry.");

        log.trace("Finished wiki_search for '{}': {} hits", query, hits.size());
        return sb.toString();
    }

    @Override
    public String describe(String argsJson) {
        return "Searching wiki for '" + extractArg(argsJson, "query") + "'";
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
}
