package com.assistant.controller;

import com.assistant.model.GlossaryEntry;
import com.assistant.model.GlossaryGenerateRequest;
import com.assistant.model.GlossaryGenerateResult;
import com.assistant.service.GlossaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/glossary")
public class GlossaryController {

    private static final Logger log = LoggerFactory.getLogger(GlossaryController.class);

    private final GlossaryService glossaryService;

    public GlossaryController(GlossaryService glossaryService) {
        this.glossaryService = glossaryService;
    }

    @GetMapping
    public ResponseEntity<?> list() {
        log.trace("Received request to list glossary entries");
        try {
            List<GlossaryEntry> entries = glossaryService.listEntries();
            log.trace("Finished list glossary successfully: {} entries", entries.size());
            return ResponseEntity.ok(entries);
        } catch (IOException e) {
            log.error("Error listing glossary", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody GlossaryEntry body) {
        log.trace("Received request to create glossary entry: term={}", body != null ? body.getTerm() : null);
        try {
            GlossaryEntry saved = glossaryService.addEntry(body);
            log.trace("Finished create glossary entry successfully: id={}", saved.getId());
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid glossary create: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            log.error("Error saving glossary entry", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody GlossaryEntry body) {
        log.trace("Received request to update glossary entry: id={}", id);
        try {
            GlossaryEntry saved = glossaryService.updateEntry(id, body);
            log.trace("Finished update glossary entry successfully: id={}", id);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid glossary update: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            log.error("Error updating glossary entry {}", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        log.trace("Received request to delete glossary entry: id={}", id);
        try {
            glossaryService.deleteEntry(id);
            log.trace("Finished delete glossary entry successfully: id={}", id);
            return ResponseEntity.ok(Map.of("status", "deleted", "id", id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            log.error("Error deleting glossary entry {}", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generate(@RequestBody GlossaryGenerateRequest body) {
        log.trace(
                "Received request to generate glossary: termLen={}, contextLen={}",
                body != null && body.getTerm() != null ? body.getTerm().length() : 0,
                body != null && body.getChatContext() != null ? body.getChatContext().length() : 0);
        try {
            GlossaryGenerateResult result = glossaryService.generateDefinition(body);
            log.trace(
                    "Finished generate glossary successfully: termLen={}, definitionLen={}",
                    result.getTerm() != null ? result.getTerm().length() : 0,
                    result.getDefinition() != null ? result.getDefinition().length() : 0);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid glossary generate: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            log.warn("Glossary generate parse/state: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            log.error("Error during glossary generate", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            log.error("Error during glossary generate (LLM or network)", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage() != null ? e.getMessage() : "LLM request failed"));
        }
    }
}
