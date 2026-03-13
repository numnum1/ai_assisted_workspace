package com.assistant.controller;

import com.assistant.model.FileNode;
import com.assistant.service.FileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping
    public ResponseEntity<FileNode> getFileTree() throws IOException {
        return ResponseEntity.ok(fileService.getFileTree());
    }

    @GetMapping("/content/**")
    public ResponseEntity<Map<String, Object>> getFileContent(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/files/content/");
        String content = fileService.readFile(path);
        int lines = fileService.countLines(path);
        return ResponseEntity.ok(Map.of(
            "path", path,
            "content", content,
            "lines", lines
        ));
    }

    @PutMapping("/content/**")
    public ResponseEntity<Map<String, String>> saveFileContent(
            HttpServletRequest request,
            @RequestBody Map<String, String> body) throws IOException {
        String path = extractPath(request, "/api/files/content/");
        String content = body.get("content");
        if (content == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing 'content' field"));
        }
        fileService.writeFile(path, content);
        return ResponseEntity.ok(Map.of("status", "saved", "path", path));
    }

    @DeleteMapping("/content/**")
    public ResponseEntity<Map<String, String>> deleteFile(HttpServletRequest request) throws IOException {
        String path = extractPath(request, "/api/files/content/");
        fileService.deleteFile(path);
        return ResponseEntity.ok(Map.of("status", "deleted", "path", path));
    }

    @PostMapping("/create-file")
    public ResponseEntity<Map<String, String>> createFile(@RequestBody Map<String, String> body) throws IOException {
        String parentPath = body.get("parentPath");
        String name = body.get("name");
        if (parentPath == null || name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "parentPath and name are required"));
        }
        String path = fileService.createFile(parentPath, name);
        return ResponseEntity.ok(Map.of("status", "created", "path", path));
    }

    @PostMapping("/create-folder")
    public ResponseEntity<Map<String, String>> createFolder(@RequestBody Map<String, String> body) throws IOException {
        String parentPath = body.get("parentPath");
        String name = body.get("name");
        if (parentPath == null || name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "parentPath and name are required"));
        }
        String path = fileService.createDirectory(parentPath, name);
        return ResponseEntity.ok(Map.of("status", "created", "path", path));
    }

    @PostMapping("/open-in-explorer")
    public ResponseEntity<Map<String, String>> openInExplorer(@RequestBody Map<String, String> body) throws IOException {
        String path = body.get("path");
        if (path == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "path is required"));
        }
        fileService.openInExplorer(path);
        return ResponseEntity.ok(Map.of("status", "opened"));
    }

    @PostMapping("/rename")
    public ResponseEntity<Map<String, String>> rename(@RequestBody Map<String, String> body) throws IOException {
        String path = body.get("path");
        String newName = body.get("newName");
        if (path == null || newName == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "path and newName are required"));
        }
        String newPath = fileService.rename(path, newName);
        return ResponseEntity.ok(Map.of("status", "renamed", "path", newPath));
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
