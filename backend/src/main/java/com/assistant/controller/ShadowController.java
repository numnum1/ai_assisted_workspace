package com.assistant.controller;

import com.assistant.service.ShadowWikiService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * REST endpoints for shadow (meta-note) files stored under {@code .wiki/files/}.
 * Each project file may optionally have a corresponding shadow file at the same relative path.
 */
@RestController
@RequestMapping("/api/shadow")
public class ShadowController {

    private final ShadowWikiService shadowWikiService;

    public ShadowController(ShadowWikiService shadowWikiService) {
        this.shadowWikiService = shadowWikiService;
    }

    /** Returns the shadow file content for a project file, or {@code exists: false} if none exists. */
    @GetMapping("/content/**")
    public ResponseEntity<Map<String, Object>> getShadow(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/shadow/content/");
        if (!shadowWikiService.exists(path)) {
            return ResponseEntity.ok(Map.of("exists", false, "content", ""));
        }
        String content = shadowWikiService.read(path);
        return ResponseEntity.ok(Map.of("exists", true, "content", content));
    }

    /** Creates or overwrites the shadow file for a project file. */
    @PutMapping("/content/**")
    public ResponseEntity<Map<String, String>> saveShadow(
            HttpServletRequest request,
            @RequestBody Map<String, String> body) throws IOException {
        String path = extractPath(request, "/api/shadow/content/");
        String content = body.get("content");
        if (content == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing 'content' field"));
        }
        shadowWikiService.write(path, content);
        return ResponseEntity.ok(Map.of("status", "saved", "path", path));
    }

    /** Deletes the shadow file for a project file. No-op if it does not exist. */
    @DeleteMapping("/content/**")
    public ResponseEntity<Map<String, String>> deleteShadow(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/shadow/content/");
        shadowWikiService.delete(path);
        return ResponseEntity.ok(Map.of("status", "deleted", "path", path));
    }

    private String extractPath(HttpServletRequest request, String prefix) {
        String uri = request.getRequestURI();
        String rawPath = uri.substring(uri.indexOf(prefix) + prefix.length());
        try {
            return URLDecoder.decode(rawPath, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return rawPath;
        }
    }
}
