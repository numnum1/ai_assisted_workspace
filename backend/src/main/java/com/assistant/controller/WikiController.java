package com.assistant.controller;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/wiki")
public class WikiController {

    private static final Logger log = LoggerFactory.getLogger(WikiController.class);
    private static final String WIKI_DIR = ".wiki";

    private final FileService fileService;

    public WikiController(FileService fileService) {
        this.fileService = fileService;
    }

    /**
     * Returns all .wiki entries with parsed frontmatter fields for the Content Browser.
     */
    @GetMapping("/entries")
    public ResponseEntity<?> getEntries() {
        if (!fileService.isDirectory(WIKI_DIR)) {
            return ResponseEntity.ok(List.of());
        }

        List<String> allFiles;
        try {
            allFiles = fileService.listFiles(WIKI_DIR);
        } catch (IOException e) {
            log.error("Error listing wiki files", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Error reading wiki directory: " + e.getMessage()));
        }

        List<Map<String, Object>> entries = new ArrayList<>();
        for (String path : allFiles) {
            if (!path.endsWith(".md")) continue;

            try {
                String content = fileService.readFile(path);
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("path", path);
                entry.put("type", extractFrontmatterValue(content, "type"));
                entry.put("summary", extractFrontmatterValue(content, "summary"));
                entry.put("aliases", extractFrontmatterValue(content, "aliases"));
                entry.put("tags", extractFrontmatterValue(content, "tags"));

                String fileName = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
                String displayName = fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : fileName;
                String id = extractFrontmatterValue(content, "id");
                entry.put("name", id != null ? id : displayName);

                entries.add(entry);
            } catch (IOException e) {
                log.warn("Could not read wiki entry: {}", path);
            }
        }

        return ResponseEntity.ok(entries);
    }

    private String extractFrontmatterValue(String content, String key) {
        if (content == null || !content.startsWith("---")) return null;

        int fmEnd = content.indexOf("\n---", 3);
        String frontmatter = fmEnd > 0 ? content.substring(0, fmEnd) : content;

        String search = "\n" + key + ":";
        int idx = frontmatter.indexOf(search);
        if (idx == -1) return null;

        int lineStart = idx + search.length();
        int lineEnd = frontmatter.indexOf('\n', lineStart);
        String valuePart = lineEnd > 0
                ? frontmatter.substring(lineStart, lineEnd).trim()
                : frontmatter.substring(lineStart).trim();

        if (valuePart.equals(">") || valuePart.equals("|")) {
            if (lineEnd == -1) return null;
            int nextLineStart = lineEnd + 1;
            int nextLineEnd = frontmatter.indexOf('\n', nextLineStart);
            String nextLine = nextLineEnd > 0
                    ? frontmatter.substring(nextLineStart, nextLineEnd).trim()
                    : frontmatter.substring(nextLineStart).trim();
            return nextLine.isBlank() ? null : nextLine;
        }

        return valuePart.isBlank() ? null : valuePart;
    }
}
