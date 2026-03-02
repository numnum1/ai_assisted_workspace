package com.assistant.controller;

import com.assistant.model.FileNode;
import com.assistant.service.FileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
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

    private String extractPath(HttpServletRequest request, String prefix) {
        String uri = request.getRequestURI();
        return uri.substring(uri.indexOf(prefix) + prefix.length());
    }
}
