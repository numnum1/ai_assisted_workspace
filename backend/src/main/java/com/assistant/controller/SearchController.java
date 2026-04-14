package com.assistant.controller;

import com.assistant.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * REST controller for project-wide content search.
 */
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private static final Logger log = LoggerFactory.getLogger(SearchController.class);

    private final FileService fileService;

    public SearchController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "100") int limit) throws IOException {
        if (q == null || q.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "query parameter 'q' is required"));
        }
        log.trace("Received search request for query: '{}'", q);
        List<FileService.ContentSearchHit> hits = fileService.searchInFiles(q, Math.min(limit, 500));
        log.trace("Finished search for '{}': {} hits", q, hits.size());
        return ResponseEntity.ok(Map.of("query", q, "hits", hits));
    }
}
