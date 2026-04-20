package com.assistant.meta_files;

import com.assistant.wiki.WikiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * REST controller for the wiki system.
 * Wiki entries are Markdown files in the /wiki/ directory at the project root.
 */
@RestController
@RequestMapping("/api/wiki")
public class WikiController {

    private static final Logger log = LoggerFactory.getLogger(WikiController.class);

    private final WikiService wikiService;

    public WikiController(WikiService wikiService) {
        this.wikiService = wikiService;
    }

    /**
     * Lists all wiki files as relative paths from the /wiki/ directory.
     */
    @GetMapping("/files")
    public ResponseEntity<List<String>> listWikiFiles() throws IOException {
        log.trace("Received request to list wiki files");
        List<String> files = wikiService.listWikiFiles();
        log.trace("Finished listing wiki files: {} entries", files.size());
        return ResponseEntity.ok(files);
    }

    /**
     * Searches wiki files by filename and content.
     */
    @GetMapping("/search")
    public ResponseEntity<List<WikiService.WikiSearchHit>> searchWiki(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit) throws IOException {
        log.trace("Received request to search wiki: q={}", q);
        if (q == null || q.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        List<WikiService.WikiSearchHit> hits = wikiService.searchWiki(q, Math.min(limit, 50));
        log.trace("Finished wiki search for '{}': {} hits", q, hits.size());
        return ResponseEntity.ok(hits);
    }

    /**
     * Reads a single wiki file by relative path (e.g. "characters/lupusregina.md").
     */
    @GetMapping("/files/**")
    public ResponseEntity<?> readWikiFile(@RequestParam(required = false) String path) throws IOException {
        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "path parameter is required"));
        }
        log.trace("Received request to read wiki file: {}", path);
        try {
            String content = wikiService.readWikiFile(path);
            log.trace("Finished reading wiki file: {}", path);
            return ResponseEntity.ok(Map.of("path", path, "content", content));
        } catch (java.util.NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
