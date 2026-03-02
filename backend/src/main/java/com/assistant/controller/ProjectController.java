package com.assistant.controller;

import com.assistant.config.AppConfig;
import com.assistant.model.FileNode;
import com.assistant.service.FileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@RestController
@RequestMapping("/api/project")
public class ProjectController {

    private final AppConfig appConfig;
    private final FileService fileService;

    public ProjectController(AppConfig appConfig, FileService fileService) {
        this.appConfig = appConfig;
        this.fileService = fileService;
    }

    @GetMapping("/current")
    public ResponseEntity<Map<String, Object>> current() {
        String path = appConfig.getProject().getPath();
        boolean hasProject = path != null && !path.isBlank() && Files.isDirectory(Path.of(path));
        return ResponseEntity.ok(Map.of(
                "path", path != null ? path : "",
                "hasProject", hasProject
        ));
    }

    @PostMapping("/open")
    public ResponseEntity<?> open(@RequestBody Map<String, String> body) {
        String requestedPath = body.get("path");
        if (requestedPath == null || requestedPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Path is required"));
        }

        Path dir = Path.of(requestedPath);
        if (!Files.isDirectory(dir)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Not a valid directory: " + requestedPath));
        }

        appConfig.getProject().setPath(requestedPath);

        try {
            FileNode tree = fileService.getFileTree();
            return ResponseEntity.ok(Map.of(
                    "status", "opened",
                    "path", requestedPath,
                    "tree", tree
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to read directory: " + e.getMessage()));
        }
    }
}
