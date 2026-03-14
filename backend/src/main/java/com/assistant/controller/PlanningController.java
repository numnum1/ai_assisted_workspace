package com.assistant.controller;

import com.assistant.model.PlanningNode;
import com.assistant.service.FileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Collections;

@RestController
@RequestMapping("/api/planning")
public class PlanningController {

    private final FileService fileService;

    public PlanningController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping("/outline")
    public ResponseEntity<List<PlanningNode>> getOutline() {
        try {
            return ResponseEntity.ok(fileService.getPlanningOutline());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/move")
    public ResponseEntity<Map<String, String>> move(@RequestBody Map<String, String> body) {
        String from = body.get("from");
        String toParent = body.get("toParent");
        if (from == null || toParent == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "'from' and 'toParent' are required"));
        }
        try {
            String newPath = fileService.movePlanningNode(from, toParent);
            return ResponseEntity.ok(Map.of("path", newPath));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Creates a scene metafile and appends its marker to the chapter text file.
     * Body: { chapterPath: "buch/kapitel-01.md", sceneId: "szene-03" }
     */
    @PostMapping("/scene/create")
    public ResponseEntity<Map<String, String>> createScene(@RequestBody Map<String, String> body) {
        String chapterPath = body.get("chapterPath");
        String sceneId = body.get("sceneId");
        if (chapterPath == null || sceneId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "'chapterPath' and 'sceneId' are required"));
        }
        try {
            String metaPath = fileService.createScene(chapterPath, sceneId);
            return ResponseEntity.ok(Map.of("metaPath", metaPath));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Removes a scene marker from the chapter text file and deletes the scene metafile.
     * Body: { chapterPath: "buch/kapitel-01.md", sceneId: "szene-03" }
     */
    @PostMapping("/scene/delete")
    public ResponseEntity<Map<String, String>> deleteScene(@RequestBody Map<String, String> body) {
        String chapterPath = body.get("chapterPath");
        String sceneId = body.get("sceneId");
        if (chapterPath == null || sceneId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "'chapterPath' and 'sceneId' are required"));
        }
        try {
            fileService.deleteScene(chapterPath, sceneId);
            return ResponseEntity.ok(Map.of("status", "deleted"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Reorders scene blocks within a chapter text file.
     * Body: { chapterPath: "buch/kapitel-01.md", sceneOrder: ["szene-02", "szene-01"] }
     */
    @PostMapping("/scene/reorder")
    public ResponseEntity<Map<String, String>> reorderScenes(@RequestBody Map<String, Object> body) {
        String chapterPath = (String) body.get("chapterPath");
        @SuppressWarnings("unchecked")
        List<String> sceneOrder = body.get("sceneOrder") instanceof List<?>
            ? (List<String>) body.get("sceneOrder")
            : Collections.emptyList();
        if (chapterPath == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "'chapterPath' is required"));
        }
        try {
            fileService.reorderScenes(chapterPath, sceneOrder);
            return ResponseEntity.ok(Map.of("status", "reordered"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
