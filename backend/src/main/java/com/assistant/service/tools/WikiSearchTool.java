package com.assistant.service.tools;

import com.assistant.model.WikiEntry;
import com.assistant.model.WikiType;
import com.assistant.service.WikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Searches the project wiki (.wiki/entries/) for entries across all types.
 * Returns a compact hit list. Use wiki_read to retrieve the full entry content.
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
                "description", "Search the project wiki for characters, locations, organizations, and other world-building entries. " +
                        "Returns a compact list of matching entries with their IDs. " +
                        "Use wiki_read afterwards to get the full content of a specific entry.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "query", Map.of(
                            "type", "string",
                            "description", "Search term matched against all field values of each entry (case-insensitive)"
                        ),
                        "type", Map.of(
                            "type", "string",
                            "description", "Optional filter by wiki type ID (e.g. 'character', 'location', 'organization')"
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

        String typeFilter = extractArg(argsJson, "type");
        int limit = parseLimit(extractArg(argsJson, "limit"));
        String lowerQuery = query.toLowerCase();

        List<WikiType> types;
        try {
            types = wikiService.listTypes();
        } catch (IOException e) {
            log.error("Error listing wiki types", e);
            return "Error reading wiki types: " + e.getMessage();
        }

        if (types.isEmpty()) {
            return "No wiki types found. Create wiki types and entries in the Wiki browser first.";
        }

        List<WikiHit> hits = new ArrayList<>();

        for (WikiType type : types) {
            if (typeFilter != null && !typeFilter.isBlank()
                    && !type.getId().toLowerCase().contains(typeFilter.toLowerCase())
                    && !type.getName().toLowerCase().contains(typeFilter.toLowerCase())) {
                continue;
            }

            List<WikiEntry> entries;
            try {
                entries = wikiService.listEntries(type.getId());
            } catch (IOException e) {
                log.warn("Could not read entries for type: {}", type.getId());
                continue;
            }

            for (WikiEntry entry : entries) {
                if (matchesQuery(entry, lowerQuery)) {
                    String displayName = entry.getValues() != null ? entry.getValues().get("name") : null;
                    if (displayName == null || displayName.isBlank()) {
                        displayName = entry.getId();
                    }
                    hits.add(new WikiHit(type.getId() + "/" + entry.getId(), type.getName(), displayName));
                    if (hits.size() >= limit) break;
                }
            }

            if (hits.size() >= limit) break;
        }

        if (hits.isEmpty()) {
            return "No wiki entries found matching '" + query + "'" +
                    (typeFilter != null && !typeFilter.isBlank() ? " with type='" + typeFilter + "'" : "") + ".";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Found ").append(hits.size()).append(" wiki entry/entries matching '").append(query).append("':\n\n");
        for (WikiHit hit : hits) {
            sb.append("- **").append(hit.id()).append("** [").append(hit.typeName()).append("]\n");
            sb.append("  ").append(hit.displayName()).append("\n");
        }
        sb.append("\nUse wiki_read with the id to get the full entry.");
        return sb.toString();
    }

    @Override
    public String describe(String argsJson) {
        String query = extractArg(argsJson, "query");
        String type = extractArg(argsJson, "type");
        if (type != null && !type.isBlank()) {
            return "Searching wiki for " + type + ": '" + query + "'";
        }
        return "Searching wiki for '" + query + "'";
    }

    private boolean matchesQuery(WikiEntry entry, String lowerQuery) {
        String entryId = entry.getId();

        // 1. Direct substring match on id and field values
        if (entryId.toLowerCase().contains(lowerQuery)) return true;
        if (fieldValuesContain(entry, lowerQuery)) return true;

        // 2. Normalized match: strip all separators (spaces, hyphens, underscores) from both sides
        //    "vanilla sloth" → "vanillasloth" matches "vanillaSloth" → "vanillasloth"
        String normalizedQuery = lowerQuery.replaceAll("[\\s\\-_]", "");
        if (!normalizedQuery.isEmpty()) {
            String normalizedId = entryId.toLowerCase().replaceAll("[\\s\\-_]", "");
            if (normalizedId.contains(normalizedQuery)) return true;
        }

        // 3. Token-based match: split query into words and check that every token appears
        //    somewhere in the camelCase-split id or in any field value.
        //    "Vanilla Sloth" → ["vanilla","sloth"]; "vanillaSloth" splits to "vanilla sloth"
        String[] queryTokens = lowerQuery.trim().split("[\\s\\-_]+");
        if (queryTokens.length > 1) {
            // expand camelCase id to space-separated lowercase words
            String expandedId = entryId
                    .replaceAll("([a-z])([A-Z])", "$1 $2")
                    .replaceAll("[\\-_]", " ")
                    .toLowerCase();
            boolean allTokensMatch = Arrays.stream(queryTokens)
                    .allMatch(token -> expandedId.contains(token) || fieldValuesContain(entry, token));
            if (allTokensMatch) return true;
        }

        return false;
    }

    private boolean fieldValuesContain(WikiEntry entry, String lowerToken) {
        if (entry.getValues() == null) return false;
        for (String value : entry.getValues().values()) {
            if (value != null && value.toLowerCase().contains(lowerToken)) return true;
        }
        return false;
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

    private record WikiHit(String id, String typeName, String displayName) {}
}
