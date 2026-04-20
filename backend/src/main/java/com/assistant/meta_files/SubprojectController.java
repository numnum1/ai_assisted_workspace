package com.assistant.meta_files;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/subproject")
public class SubprojectController {

    private final SubprojectService subprojectService;

    public SubprojectController(SubprojectService subprojectService) {
        this.subprojectService = subprojectService;
    }

    @GetMapping("/info")
    public ResponseEntity<?> info(@RequestParam("path") String relativePath) {
        try {
            SubprojectConfig cfg = subprojectService.getInfo(relativePath);
            if (cfg == null) {
                return ResponseEntity.ok(Map.of("subproject", false));
            }
            return ResponseEntity.ok(Map.of(
                    "subproject", true,
                    "type", cfg.getType() != null ? cfg.getType() : "",
                    "name", cfg.getName() != null ? cfg.getName() : ""
            ));
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/init")
    public ResponseEntity<?> init(@RequestBody Map<String, String> body) {
        String path = body.get("path");
        String type = body.get("type");
        String name = body.getOrDefault("name", "");
        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "path is required"));
        }
        try {
            subprojectService.init(path, type, name);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/remove")
    public ResponseEntity<?> remove(@RequestParam("path") String relativePath) {
        try {
            subprojectService.remove(relativePath);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
