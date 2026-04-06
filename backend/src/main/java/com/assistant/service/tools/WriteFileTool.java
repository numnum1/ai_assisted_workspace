package com.assistant.service.tools;

import com.assistant.service.FileService;
import com.assistant.service.SnapshotService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * AI tool that writes (creates or overwrites) a project file.
 * Before writing, saves the current content as a revert snapshot.
 * Returns a structured result that the frontend renders as a Change Card.
 */
@Component
public class WriteFileTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(WriteFileTool.class);

    private final FileService fileService;
    private final SnapshotService snapshotService;

    public WriteFileTool(FileService fileService, SnapshotService snapshotService) {
        this.fileService = fileService;
        this.snapshotService = snapshotService;
    }

    @Override
    public String getName() {
        return "write_file";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Write (create or overwrite) a project file with the given content. " +
                        "The old content is saved as a revert snapshot so the user can undo the change. " +
                        "Use this to create wiki entries, edit chapters, update any project file. " +
                        "Always write the complete file content, not just the changed parts.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "path", Map.of(
                            "type", "string",
                            "description", "Relative path within the project, e.g. 'wiki/characters/lupusregina.md'"
                        ),
                        "content", Map.of(
                            "type", "string",
                            "description", "Full content to write to the file"
                        ),
                        "description", Map.of(
                            "type", "string",
                            "description", "Short description of what was changed and why (shown in the Change Card)"
                        )
                    ),
                    "required", List.of("path", "content", "description")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String path = extractArg(argsJson, "path");
        String content = extractArg(argsJson, "content");
        String description = extractArg(argsJson, "description");

        if (path == null || path.isBlank()) {
            return "Error: missing 'path' parameter";
        }
        if (content == null) {
            return "Error: missing 'content' parameter";
        }
        if (description == null || description.isBlank()) {
            description = "File updated";
        }

        log.trace("Received request to write_file: {}", path);

        boolean wasNew = !fileService.fileExists(path);
        String oldContent = null;

        if (!wasNew) {
            try {
                oldContent = fileService.readFile(path);
            } catch (IOException e) {
                log.warn("Could not read old content for snapshot of {}: {}", path, e.getMessage());
            }
        }

        try {
            fileService.writeFile(path, content);
        } catch (IOException e) {
            log.error("write_file failed for path {}: {}", path, e.getMessage(), e);
            return "Error writing file: " + e.getMessage();
        }

        String snapshotId = snapshotService.save(path, oldContent != null ? oldContent : "", wasNew);

        log.trace("Finished write_file: {} (snapshotId={})", path, snapshotId);
        return "write_file:success:" + snapshotId + ":" + (wasNew ? "new" : "modified") + ":" + path + ":" + description;
    }

    @Override
    public String describe(String argsJson) {
        String path = extractArg(argsJson, "path");
        String description = extractArg(argsJson, "description");
        if (description != null && !description.isBlank()) {
            return description + " (" + path + ")";
        }
        return "Writing file: " + (path != null ? path : "unknown");
    }
}
