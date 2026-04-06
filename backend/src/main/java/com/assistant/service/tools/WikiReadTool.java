package com.assistant.service.tools;

import com.assistant.model.WikiEntry;
import com.assistant.model.WikiType;
import com.assistant.service.WikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Reads a single wiki entry by its id (typeId/entryId).
 * Use wiki_search first to find the correct id.
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
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the full content of a single wiki entry by its id. " +
                        "Use wiki_search first to discover the correct id.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "id", Map.of(
                            "type", "string",
                            "description", "The wiki entry id in the format 'typeId/entryId' (e.g. 'character/mara-voss')"
                        )
                    ),
                    "required", List.of("id")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String id = extractArg(argsJson, "id");
        if (id == null || id.isBlank()) {
            return "Error: missing 'id' parameter";
        }

        String normalized = id.replace('\\', '/').trim();
        int slash = normalized.indexOf('/');
        if (slash <= 0 || slash == normalized.length() - 1) {
            return "Error: id must be in format 'typeId/entryId' (e.g. 'character/mara-voss'), got: '" + id + "'";
        }
        if (normalized.contains("..")) {
            return "Error: path traversal not allowed";
        }

        String typeId = normalized.substring(0, slash);
        String entryId = normalized.substring(slash + 1);

        WikiType type;
        try {
            type = wikiService.getType(typeId);
        } catch (NoSuchElementException e) {
            return "Wiki type not found: '" + typeId + "'";
        } catch (IOException e) {
            log.error("Error reading wiki type: {}", typeId, e);
            return "Error reading wiki type: " + e.getMessage();
        }

        WikiEntry entry;
        try {
            entry = wikiService.getEntry(typeId, entryId);
        } catch (NoSuchElementException e) {
            return "Wiki entry not found: '" + id + "'";
        } catch (IOException e) {
            log.error("Error reading wiki entry: {}/{}", typeId, entryId, e);
            return "Error reading wiki entry: " + e.getMessage();
        }

        return wikiService.formatEntryForAi(entry, type);
    }

    @Override
    public String describe(String argsJson) {
        return "Reading wiki entry: " + extractArg(argsJson, "id");
    }
}
