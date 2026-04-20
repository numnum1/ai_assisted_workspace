package com.assistant.glossary;

import com.assistant.file_services.GlossaryService;
import com.assistant.file_services.GlossaryService.GlossaryParseResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", content != null ? content : "");
        body.put("exists", content != null);
        if (content != null) {
            GlossaryParseResult parsed = glossaryService.parseGlossaryContent(content);
            body.put("prefixMarkdown", parsed.prefixMarkdown());
            body.put("entries", parsed.entries().stream()
                    .map(e -> Map.of("term", e.term(), "definition", e.definition()))
                    .collect(Collectors.toList()));
        } else {
            body.put("prefixMarkdown", "");
            body.put("entries", List.of());
        }
        log.trace("Finished getting glossary");
        return ResponseEntity.ok(body);
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

    @DeleteMapping("/entries")
    public ResponseEntity<Map<String, String>> deleteEntry(@RequestParam("term") String term) throws IOException {
        if (term == null || term.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "term is required"));
        }
        log.trace("Received request to delete glossary entry: {}", term);
        int removed = glossaryService.removeEntry(term);
        if (removed < 0) {
            log.trace("Finished delete glossary entry: {} (glossary not available)", term);
            return ResponseEntity.notFound().build();
        }
        if (removed == 0) {
            log.trace("Finished delete glossary entry: {} (not found)", term);
            return ResponseEntity.notFound().build();
        }
        log.trace("Finished delete glossary entry: {} ({} line(s))", term, removed);
        return ResponseEntity.ok(Map.of("status", "removed", "term", term.trim()));
    }
}
