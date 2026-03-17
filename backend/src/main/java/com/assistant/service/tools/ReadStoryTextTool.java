package com.assistant.service.tools;

import com.assistant.model.ActionNode;
import com.assistant.model.ChapterNode;
import com.assistant.model.SceneNode;
import com.assistant.service.ChapterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.List;
import java.util.Map;

@Component
public class ReadStoryTextTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(ReadStoryTextTool.class);

    private final ChapterService chapterService;

    public ReadStoryTextTool(ChapterService chapterService) {
        this.chapterService = chapterService;
    }

    @Override
    public String getName() {
        return "read_story_text";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the combined prose text of all actions in a scene or chapter. " +
                        "If scene_id is provided, returns only that scene's text. " +
                        "If only chapter_id is provided, returns the full text of the entire chapter. " +
                        "Use this to read what has actually been written in the story.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "chapter_id", Map.of(
                            "type", "string",
                            "description", "ID of the chapter (e.g. 'chapter_1')"
                        ),
                        "scene_id", Map.of(
                            "type", "string",
                            "description", "ID of a specific scene within the chapter (e.g. 'scene_1'). " +
                                    "If omitted, all scenes of the chapter are returned."
                        )
                    ),
                    "required", List.of("chapter_id")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String chapterId = extractArg(argsJson, "chapter_id");
        if (chapterId == null || chapterId.isBlank()) {
            return "Error: missing 'chapter_id' parameter";
        }
        String sceneId = extractArg(argsJson, "scene_id");

        ChapterNode chapter;
        try {
            chapter = chapterService.getChapter(chapterId);
        } catch (NoSuchFileException e) {
            return "Chapter not found: " + chapterId;
        } catch (IOException e) {
            log.error("Error loading chapter: {}", chapterId, e);
            return "Error loading chapter: " + e.getMessage();
        }

        if (sceneId != null && chapter.getScenes().stream().noneMatch(s -> s.getId().equals(sceneId))) {
            return "Scene not found: " + sceneId + " in chapter " + chapterId;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("== Chapter: \"").append(chapter.getMeta().getTitle()).append("\" ==\n\n");

        for (SceneNode scene : chapter.getScenes()) {
            if (sceneId != null && !scene.getId().equals(sceneId)) continue;

            sb.append("-- Scene: \"").append(scene.getMeta().getTitle()).append("\" --\n\n");

            boolean hasContent = false;
            for (ActionNode action : scene.getActions()) {
                try {
                    String content = chapterService.readActionContent(chapterId, scene.getId(), action.getId());
                    if (!content.isBlank()) {
                        sb.append(content.strip()).append("\n\n");
                        hasContent = true;
                    }
                } catch (IOException e) {
                    log.warn("Error reading action content: {}/{}/{}", chapterId, scene.getId(), action.getId(), e);
                }
            }

            if (!hasContent) {
                sb.append("[No text written yet]\n\n");
            }
        }

        return sb.toString().strip();
    }

    @Override
    public String describe(String argsJson) {
        String chapterId = extractArg(argsJson, "chapter_id");
        String sceneId = extractArg(argsJson, "scene_id");
        if (sceneId != null) {
            return "Reading story text: " + chapterId + " / " + sceneId;
        }
        return "Reading story text: chapter " + chapterId;
    }
}
