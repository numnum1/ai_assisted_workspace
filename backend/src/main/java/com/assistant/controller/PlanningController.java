package com.assistant.controller;

import com.assistant.model.PlanningNode;
import com.assistant.service.FileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

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
}
