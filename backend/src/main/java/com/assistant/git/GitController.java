package com.assistant.git;

import com.assistant.config.AppConfig;
import org.eclipse.jgit.api.errors.TransportException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
public class GitController {

    private static final Logger log = LoggerFactory.getLogger(GitController.class);

    private final GitService gitService;
    private final AppConfig appConfig;

    public GitController(GitService gitService, AppConfig appConfig) {
        this.gitService = gitService;
        this.appConfig = appConfig;
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        log.trace("Received request GET /api/git/status");
        try {
            if (!gitService.isRepo()) {
                log.trace("Finished GET /api/git/status: not a git repository");
                return ResponseEntity.ok(Map.of("isRepo", false));
            }
            Map<String, Object> status = gitService.status();
            status.put("isRepo", true);
            log.trace("Finished GET /api/git/status: isClean={}", status.get("isClean"));
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            log.error("Error in GET /api/git/status", e);
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/commit")
    public ResponseEntity<Map<String, String>> commit(@RequestBody Map<String, Object> body) {
        log.trace("Received request POST /api/git/commit");
        try {
            String message = (String) body.get("message");
            if (message == null || message.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Commit message required"));
            }
            @SuppressWarnings("unchecked")
            List<String> files = (List<String>) body.get("files");
            Map<String, String> result = gitService.commit(message, files);
            log.trace("Finished POST /api/git/commit: hash={}", result.get("hash"));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error in POST /api/git/commit", e);
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/revert-file")
    public ResponseEntity<?> revertFile(@RequestBody Map<String, Object> body) {
        log.trace("Received request POST /api/git/revert-file");
        try {
            String path = (String) body.get("path");
            if (path == null || path.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "File path required"));
            }
            boolean untracked = Boolean.TRUE.equals(body.get("untracked"));
            gitService.revertFile(path, untracked);
            log.trace("Finished POST /api/git/revert-file: path={}", path);
            return ResponseEntity.ok(Map.of("status", "reverted"));
        } catch (Exception e) {
            log.error("Error in POST /api/git/revert-file", e);
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/revert-directory")
    public ResponseEntity<?> revertDirectory(@RequestBody Map<String, Object> body) {
        log.trace("Received request POST /api/git/revert-directory");
        try {
            String path = (String) body.get("path");
            if (path == null || path.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Directory path required"));
            }
            gitService.revertDirectory(path);
            log.trace("Finished POST /api/git/revert-directory: path={}", path);
            return ResponseEntity.ok(Map.of("status", "reverted"));
        } catch (Exception e) {
            log.error("Error in POST /api/git/revert-directory", e);
            throw new RuntimeException(e);
        }
    }

    @GetMapping("/diff")
    public ResponseEntity<Map<String, String>> diff() {
        log.trace("Received request GET /api/git/diff");
        try {
            String diff = gitService.diff();
            log.trace("Finished GET /api/git/diff: {} bytes", diff.length());
            return ResponseEntity.ok(Map.of("diff", diff));
        } catch (Exception e) {
            log.error("Error in GET /api/git/diff", e);
            throw new RuntimeException(e);
        }
    }

    @GetMapping("/log")
    public ResponseEntity<List<Map<String, String>>> gitLog(
            @RequestParam(defaultValue = "20") int limit) {
        log.trace("Received request GET /api/git/log, limit={}", limit);
        try {
            List<Map<String, String>> result = gitService.log(limit);
            log.trace("Finished GET /api/git/log: {} entries", result.size());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error in GET /api/git/log", e);
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/init")
    public ResponseEntity<Map<String, String>> init() {
        log.trace("Received request POST /api/git/init");
        try {
            if (gitService.isRepo()) {
                log.trace("Finished POST /api/git/init: already initialized");
                return ResponseEntity.ok(Map.of("status", "already initialized"));
            }
            gitService.init();
            log.trace("Finished POST /api/git/init: initialized");
            return ResponseEntity.ok(Map.of("status", "initialized"));
        } catch (Exception e) {
            log.error("Error in POST /api/git/init", e);
            throw new RuntimeException(e);
        }
    }

    @GetMapping("/ahead-behind")
    public ResponseEntity<?> aheadBehind() {
        log.trace("Received request GET /api/git/ahead-behind");
        if (!gitService.isRepo()) {
            log.trace("Finished GET /api/git/ahead-behind: not a git repository");
            return ResponseEntity.ok(Map.of("ahead", 0, "behind", 0));
        }
        try {
            Map<String, Integer> result = gitService.aheadBehind();
            log.trace("Finished GET /api/git/ahead-behind: ahead={}, behind={}", result.get("ahead"), result.get("behind"));
            return ResponseEntity.ok(result);
        } catch (TransportException e) {
            log.error("Transport error in GET /api/git/ahead-behind", e);
            if (isAuthError(e)) return ResponseEntity.status(401).body(Map.of("error", "auth_required"));
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error in GET /api/git/ahead-behind", e);
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/credentials")
    public ResponseEntity<?> setCredentials(@RequestBody Map<String, String> body) {
        log.trace("Received request POST /api/git/credentials");
        String username = body.getOrDefault("username", "");
        String token = body.getOrDefault("token", "");
        appConfig.getGit().setUsername(username);
        appConfig.getGit().setToken(token);
        log.trace("Finished POST /api/git/credentials: username set");
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @GetMapping("/file-history")
    public ResponseEntity<?> fileHistory(@RequestParam String path) {
        log.trace("Received request GET /api/git/file-history: path={}", path);
        try {
            List<Map<String, String>> result = gitService.getFileHistory(path);
            log.trace("Finished GET /api/git/file-history: {} commits for path={}", result.size(), path);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error in GET /api/git/file-history for path={}", path, e);
            throw new RuntimeException(e);
        }
    }

    @GetMapping("/file-at-commit")
    public ResponseEntity<?> fileAtCommit(@RequestParam String path, @RequestParam String hash) {
        log.trace("Received request GET /api/git/file-at-commit: path={}, hash={}", path, hash);
        try {
            Map<String, Object> result = gitService.getFileAtCommit(path, hash);
            log.trace("Finished GET /api/git/file-at-commit: path={}, exists={}", path, result.get("exists"));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error in GET /api/git/file-at-commit for path={}, hash={}", path, hash, e);
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync() {
        log.trace("Received request POST /api/git/sync");
        if (!gitService.isRepo()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Not a git repository"));
        }
        try {
            Map<String, String> result = gitService.sync();
            log.trace("Finished POST /api/git/sync: action={}", result.get("action"));
            return ResponseEntity.ok(result);
        } catch (IllegalStateException e) {
            log.error("Diverged branch in POST /api/git/sync", e);
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (TransportException e) {
            log.error("Transport error in POST /api/git/sync", e);
            if (isAuthError(e)) return ResponseEntity.status(401).body(Map.of("error", "auth_required"));
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error in POST /api/git/sync", e);
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
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
}
