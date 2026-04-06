package com.assistant.controller;

import com.assistant.service.GlossaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

/**
 * REST controller for the project glossary (.assistant/glossary.md).
 */
@RestController
@RequestMapping("/api/glossary")
public class GlossaryController {

    private static final Logger log = LoggerFactory.getLogger(GlossaryController.class);

    private final GlossaryService glossaryService;

    public GlossaryController(GlossaryService glossaryService) {
        this.glossaryService = glossaryService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getGlossary() {
        log.trace("Received request to get glossary");
        String content = glossaryService.readGlossary();
        log.trace("Finished getting glossary");
        return ResponseEntity.ok(Map.of(
            "content", content != null ? content : "",
            "exists", content != null
        ));
    }

    @PutMapping
    public ResponseEntity<Map<String, String>> saveGlossary(@RequestBody Map<String, String> body) throws IOException {
        String content = body.get("content");
        if (content == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "content is required"));
        }
        log.trace("Received request to save glossary");
        glossaryService.writeGlossary(content);
        log.trace("Finished saving glossary");
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @PostMapping("/entries")
    public ResponseEntity<Map<String, String>> addEntry(@RequestBody Map<String, String> body) throws IOException {
        String term = body.get("term");
        String definition = body.get("definition");
        if (term == null || term.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "term is required"));
        }
        if (definition == null || definition.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "definition is required"));
        }
        log.trace("Received request to add glossary entry: {}", term);
        glossaryService.addEntry(term, definition);
        log.trace("Finished adding glossary entry: {}", term);
        return ResponseEntity.ok(Map.of("status", "added", "term", term));
    }
}
