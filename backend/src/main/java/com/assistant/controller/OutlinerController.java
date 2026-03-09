package com.assistant.controller;

import com.assistant.service.OutlinerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

/**
 * Provides the hierarchical book structure (chapters → scenes) for the Outliner UI.
 */
@RestController
@RequestMapping("/api/outliner")
public class OutlinerController {

    private final OutlinerService outlinerService;

    public OutlinerController(OutlinerService outlinerService) {
        this.outlinerService = outlinerService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getOutlinerTree() {
        return ResponseEntity.ok(outlinerService.buildTree());
    }

    @PostMapping("/create-chapter")
    public ResponseEntity<?> createChapter(@RequestBody Map<String, String> body) throws IOException {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        String path = outlinerService.createChapter(name.trim());
        return ResponseEntity.ok(Map.of("status", "created", "path", path));
    }

    @PostMapping("/create-scene")
    public ResponseEntity<?> createScene(@RequestBody Map<String, Object> body) throws IOException {
        String chapterPath = (String) body.get("chapterPath");
        String name = (String) body.get("name");
        boolean withMetadata = Boolean.TRUE.equals(body.get("withMetadata"));

        if (chapterPath == null || name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "chapterPath and name are required"));
        }

        Map<String, String> result = outlinerService.createScene(chapterPath.trim(), name.trim(), withMetadata);
        return ResponseEntity.ok(Map.of(
            "status", "created",
            "textPath", result.getOrDefault("textPath", ""),
            "metaPath", result.getOrDefault("metaPath", "")
        ));
    }
}
