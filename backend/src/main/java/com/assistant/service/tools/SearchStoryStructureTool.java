package com.assistant.service.tools;

import com.assistant.service.ChapterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Component
public class SearchStoryStructureTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(SearchStoryStructureTool.class);

    private final ChapterService chapterService;

    public SearchStoryStructureTool(ChapterService chapterService) {
        this.chapterService = chapterService;
    }

    @Override
    public String getName() {
        return "search_story_structure";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
                "type", "function",
                "function", Map.of(
                        "name", getName(),
                        "description", "Search story chapters, scenes, and actions by title or description " +
                                "stored in their meta JSON files — not by folder/file ids like chapter_1. " +
                                "Returns canonical ids (chapter_id, scene_id, action_id), paths to .json meta and .md prose, " +
                                "and how to call read_story_text / read_file. Use this when the user names a chapter or " +
                                "scene by its human title, or when search_project finds only opaque paths.",
                        "parameters", Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "query", Map.of(
                                                "type", "string",
                                                "description", "Substring to match against titles and descriptions (case-insensitive)"
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
            return chapterService.searchStoryStructure(query);
        } catch (IOException e) {
            log.error("Error searching story structure for query: {}", query, e);
            return "Error searching story structure: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Searching story structure for '" + extractArg(argsJson, "query") + "'";
    }
}
