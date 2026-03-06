package com.assistant.controller;

import com.assistant.config.AppConfig;
import com.assistant.service.GitService;
import org.eclipse.jgit.api.errors.TransportException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
public class GitController {

    private final GitService gitService;
    private final AppConfig appConfig;

    public GitController(GitService gitService, AppConfig appConfig) {
        this.gitService = gitService;
        this.appConfig = appConfig;
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
    public ResponseEntity<?> aheadBehind() {
        if (!gitService.isRepo()) {
            return ResponseEntity.ok(Map.of("ahead", 0, "behind", 0));
        }
        try {
            return ResponseEntity.ok(gitService.aheadBehind());
        } catch (TransportException e) {
            if (isAuthError(e)) return ResponseEntity.status(401).body(Map.of("error", "auth_required"));
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/credentials")
    public ResponseEntity<?> setCredentials(@RequestBody Map<String, String> body) {
        String username = body.getOrDefault("username", "");
        String token = body.getOrDefault("token", "");
        appConfig.getGit().setUsername(username);
        appConfig.getGit().setToken(token);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    private static boolean isAuthError(TransportException e) {
        Throwable t = e;
        while (t != null) {
            String msg = t.getMessage() != null ? t.getMessage().toLowerCase() : "";
            if (msg.contains("authentication is required")
                    || msg.contains("not authorized")
                    || msg.contains("credentials")
                    || msg.contains("401")) {
                return true;
            }
            t = t.getCause();
        }
        return false;
    }

    @GetMapping("/file-history")
    public ResponseEntity<?> fileHistory(@RequestParam String path) throws Exception {
        return ResponseEntity.ok(gitService.getFileHistory(path));
    }

    @GetMapping("/file-at-commit")
    public ResponseEntity<?> fileAtCommit(@RequestParam String path, @RequestParam String hash) throws Exception {
        return ResponseEntity.ok(gitService.getFileAtCommit(path, hash));
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync() {
        if (!gitService.isRepo()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Not a git repository"));
        }
        try {
            return ResponseEntity.ok(gitService.sync());
        } catch (TransportException e) {
            if (isAuthError(e)) return ResponseEntity.status(401).body(Map.of("error", "auth_required"));
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
}
