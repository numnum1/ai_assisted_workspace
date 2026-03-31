package com.assistant.service.tools;

import com.assistant.service.ShadowWikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * AI tool that reads the shadow meta-note for a given project file.
 * Shadow notes are stored under {@code .wiki/files/} and contain supplemental
 * information about the corresponding project file (status, context, cross-references, etc.).
 */
@Component
public class ReadFileMetaTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(ReadFileMetaTool.class);

    private final ShadowWikiService shadowWikiService;

    public ReadFileMetaTool(ShadowWikiService shadowWikiService) {
        this.shadowWikiService = shadowWikiService;
    }

    @Override
    public String getName() {
        return "read_file_meta";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Read the meta-note (shadow file) attached to a project file. " +
                        "Meta-notes contain supplemental information about a file such as status, " +
                        "authoring context, cross-references to other files, or any free-form notes. " +
                        "Returns an empty result if no meta-note exists for the given file.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path of the project file whose meta-note should be read (e.g. 'characters/hero.md')"
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
        if (!shadowWikiService.exists(path)) {
            return "No meta-note found for '" + path + "'.";
        }
        try {
            String content = shadowWikiService.read(path);
            if (content.isBlank()) {
                return "Meta-note for '" + path + "' is empty.";
            }
            return "Meta-note for '" + path + "':\n\n" + content;
        } catch (IOException e) {
            log.error("Error reading meta-note for: {}", path, e);
            return "Error reading meta-note: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        return "Reading meta-note for: " + extractArg(argsJson, "path");
    }
}
