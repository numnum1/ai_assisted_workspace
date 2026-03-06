package com.assistant.controller;

import com.assistant.service.GitService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
public class GitController {

    private final GitService gitService;

    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() throws Exception {
        if (!gitService.isRepo()) {
            return ResponseEntity.ok(Map.of("isRepo", false));
        }
        Map<String, Object> status = gitService.status();
        status.put("isRepo", true);
        return ResponseEntity.ok(status);
    }

    @PostMapping("/commit")
    public ResponseEntity<Map<String, String>> commit(@RequestBody Map<String, Object> body) throws Exception {
        String message = (String) body.get("message");
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Commit message required"));
        }
        @SuppressWarnings("unchecked")
        List<String> files = (List<String>) body.get("files");
        return ResponseEntity.ok(gitService.commit(message, files));
    }

    @PostMapping("/revert-file")
    public ResponseEntity<?> revertFile(@RequestBody Map<String, Object> body) throws Exception {
        String path = (String) body.get("path");
        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File path required"));
        }
        boolean untracked = Boolean.TRUE.equals(body.get("untracked"));
        gitService.revertFile(path, untracked);
        return ResponseEntity.ok(Map.of("status", "reverted"));
    }

    @GetMapping("/diff")
    public ResponseEntity<Map<String, String>> diff() throws Exception {
        return ResponseEntity.ok(Map.of("diff", gitService.diff()));
    }

    @GetMapping("/log")
    public ResponseEntity<List<Map<String, String>>> log(
            @RequestParam(defaultValue = "20") int limit) throws Exception {
        return ResponseEntity.ok(gitService.log(limit));
    }

    @PostMapping("/init")
    public ResponseEntity<Map<String, String>> init() throws Exception {
        if (gitService.isRepo()) {
            return ResponseEntity.ok(Map.of("status", "already initialized"));
        }
        gitService.init();
        return ResponseEntity.ok(Map.of("status", "initialized"));
    }

    @GetMapping("/ahead-behind")
    public ResponseEntity<Map<String, Integer>> aheadBehind() throws Exception {
        if (!gitService.isRepo()) {
            return ResponseEntity.ok(Map.of("ahead", 0, "behind", 0));
        }
        return ResponseEntity.ok(gitService.aheadBehind());
    }

    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> sync() throws Exception {
        if (!gitService.isRepo()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Not a git repository"));
        }
        return ResponseEntity.ok(gitService.sync());
    }
}
