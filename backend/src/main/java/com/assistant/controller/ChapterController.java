package com.assistant.controller;

import com.assistant.model.*;
import com.assistant.service.ChapterService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chapters")
public class ChapterController {

    private final ChapterService chapterService;

    public ChapterController(ChapterService chapterService) {
        this.chapterService = chapterService;
    }

    // ─── Chapter list & structure ──────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<ChapterSummary>> listChapters() throws IOException {
        return ResponseEntity.ok(chapterService.listChapters());
    }

    @GetMapping("/{chapterId}")
    public ResponseEntity<ChapterNode> getChapter(@PathVariable String chapterId) throws IOException {
        return ResponseEntity.ok(chapterService.getChapter(chapterId));
    }

    // ─── Chapter CRUD ──────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<ChapterSummary> createChapter(@RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neues Kapitel");
        return ResponseEntity.ok(chapterService.createChapter(title));
    }

    @PutMapping("/{chapterId}/meta")
    public ResponseEntity<Map<String, String>> updateChapterMeta(
            @PathVariable String chapterId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateChapterMeta(chapterId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}")
    public ResponseEntity<Map<String, String>> deleteChapter(@PathVariable String chapterId) throws IOException {
        chapterService.deleteChapter(chapterId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Scene CRUD ────────────────────────────────────────────────────────────

    @PostMapping("/{chapterId}/scenes")
    public ResponseEntity<SceneNode> createScene(
            @PathVariable String chapterId,
            @RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neue Szene");
        return ResponseEntity.ok(chapterService.createScene(chapterId, title));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/meta")
    public ResponseEntity<Map<String, String>> updateSceneMeta(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateSceneMeta(chapterId, sceneId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}/scenes/{sceneId}")
    public ResponseEntity<Map<String, String>> deleteScene(
            @PathVariable String chapterId,
            @PathVariable String sceneId) throws IOException {
        chapterService.deleteScene(chapterId, sceneId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Action CRUD ───────────────────────────────────────────────────────────

    @PostMapping("/{chapterId}/scenes/{sceneId}/actions")
    public ResponseEntity<ActionNode> createAction(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neue Handlungseinheit");
        return ResponseEntity.ok(chapterService.createAction(chapterId, sceneId, title));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/meta")
    public ResponseEntity<Map<String, String>> updateActionMeta(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateActionMeta(chapterId, sceneId, actionId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}")
    public ResponseEntity<Map<String, String>> deleteAction(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId) throws IOException {
        chapterService.deleteAction(chapterId, sceneId, actionId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Action content ────────────────────────────────────────────────────────

    @GetMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/content")
    public ResponseEntity<Map<String, String>> getActionContent(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId) throws IOException {
        String content = chapterService.readActionContent(chapterId, sceneId, actionId);
        return ResponseEntity.ok(Map.of("content", content));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/content")
    public ResponseEntity<Map<String, String>> saveActionContent(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId,
            @RequestBody Map<String, String> body) throws IOException {
        String content = body.getOrDefault("content", "");
        chapterService.writeActionContent(chapterId, sceneId, actionId, content);
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    // ─── Reorder ──────────────────────────────────────────────────────────────

    @PutMapping("/{chapterId}/reorder")
    public ResponseEntity<Map<String, String>> reorderScenes(
            @PathVariable String chapterId,
            @RequestBody Map<String, List<String>> body) throws IOException {
        List<String> ids = body.get("ids");
        if (ids == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids required"));
        }
        chapterService.reorderScenes(chapterId, ids);
        return ResponseEntity.ok(Map.of("status", "reordered"));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/reorder")
    public ResponseEntity<Map<String, String>> reorderActions(
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody Map<String, List<String>> body) throws IOException {
        List<String> ids = body.get("ids");
        if (ids == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids required"));
        }
        chapterService.reorderActions(chapterId, sceneId, ids);
        return ResponseEntity.ok(Map.of("status", "reordered"));
    }
}
