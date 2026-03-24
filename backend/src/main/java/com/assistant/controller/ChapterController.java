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

    private static String normalizeRoot(String root) {
        return (root == null || root.isBlank() || ".".equals(root)) ? null : root;
    }

    // ─── Chapter list & structure ──────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<ChapterSummary>> listChapters(
            @RequestParam(value = "root", required = false) String root) throws IOException {
        return ResponseEntity.ok(chapterService.listChapters(normalizeRoot(root)));
    }

    @GetMapping("/{chapterId}")
    public ResponseEntity<ChapterNode> getChapter(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId) throws IOException {
        return ResponseEntity.ok(chapterService.getChapter(normalizeRoot(root), chapterId));
    }

    // ─── Chapter CRUD ──────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<ChapterSummary> createChapter(
            @RequestParam(value = "root", required = false) String root,
            @RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neues Kapitel");
        return ResponseEntity.ok(chapterService.createChapter(normalizeRoot(root), title));
    }

    @PutMapping("/{chapterId}/meta")
    public ResponseEntity<Map<String, String>> updateChapterMeta(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateChapterMeta(normalizeRoot(root), chapterId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}")
    public ResponseEntity<Map<String, String>> deleteChapter(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId) throws IOException {
        chapterService.deleteChapter(normalizeRoot(root), chapterId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Scene CRUD ────────────────────────────────────────────────────────────

    @PostMapping("/{chapterId}/scenes")
    public ResponseEntity<SceneNode> createScene(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neue Szene");
        return ResponseEntity.ok(chapterService.createScene(normalizeRoot(root), chapterId, title));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/meta")
    public ResponseEntity<Map<String, String>> updateSceneMeta(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateSceneMeta(normalizeRoot(root), chapterId, sceneId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}/scenes/{sceneId}")
    public ResponseEntity<Map<String, String>> deleteScene(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId) throws IOException {
        chapterService.deleteScene(normalizeRoot(root), chapterId, sceneId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Action CRUD ───────────────────────────────────────────────────────────

    @PostMapping("/{chapterId}/scenes/{sceneId}/actions")
    public ResponseEntity<ActionNode> createAction(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody Map<String, String> body) throws IOException {
        String title = body.getOrDefault("title", "Neue Handlungseinheit");
        return ResponseEntity.ok(chapterService.createAction(normalizeRoot(root), chapterId, sceneId, title));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/meta")
    public ResponseEntity<Map<String, String>> updateActionMeta(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId,
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateActionMeta(normalizeRoot(root), chapterId, sceneId, actionId, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}")
    public ResponseEntity<Map<String, String>> deleteAction(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId) throws IOException {
        chapterService.deleteAction(normalizeRoot(root), chapterId, sceneId, actionId);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ─── Action content ────────────────────────────────────────────────────────

    @GetMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/content")
    public ResponseEntity<Map<String, String>> getActionContent(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId) throws IOException {
        String content = chapterService.readActionContent(normalizeRoot(root), chapterId, sceneId, actionId);
        return ResponseEntity.ok(Map.of("content", content));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/actions/{actionId}/content")
    public ResponseEntity<Map<String, String>> saveActionContent(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @PathVariable String actionId,
            @RequestBody Map<String, String> body) throws IOException {
        String content = body.getOrDefault("content", "");
        chapterService.writeActionContent(normalizeRoot(root), chapterId, sceneId, actionId, content);
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    // ─── Reorder ──────────────────────────────────────────────────────────────

    @PutMapping("/{chapterId}/reorder")
    public ResponseEntity<Map<String, String>> reorderScenes(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @RequestBody Map<String, List<String>> body) throws IOException {
        List<String> ids = body.get("ids");
        if (ids == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids required"));
        }
        chapterService.reorderScenes(normalizeRoot(root), chapterId, ids);
        return ResponseEntity.ok(Map.of("status", "reordered"));
    }

    @PutMapping("/{chapterId}/scenes/{sceneId}/reorder")
    public ResponseEntity<Map<String, String>> reorderActions(
            @RequestParam(value = "root", required = false) String root,
            @PathVariable String chapterId,
            @PathVariable String sceneId,
            @RequestBody Map<String, List<String>> body) throws IOException {
        List<String> ids = body.get("ids");
        if (ids == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids required"));
        }
        chapterService.reorderActions(normalizeRoot(root), chapterId, sceneId, ids);
        return ResponseEntity.ok(Map.of("status", "reordered"));
    }
}
