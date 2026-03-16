package com.assistant.controller;

import com.assistant.model.WikiEntry;
import com.assistant.model.WikiType;
import com.assistant.service.WikiService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/wiki")
public class WikiController {

    private final WikiService wikiService;

    public WikiController(WikiService wikiService) {
        this.wikiService = wikiService;
    }

    // ─── Types ────────────────────────────────────────────────────────────────

    @GetMapping("/types")
    public ResponseEntity<List<WikiType>> listTypes() throws IOException {
        return ResponseEntity.ok(wikiService.listTypes());
    }

    @PostMapping("/types")
    public ResponseEntity<?> createType(@RequestBody Map<String, String> body) throws IOException {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        return ResponseEntity.ok(wikiService.createType(name));
    }

    @GetMapping("/types/{typeId}")
    public ResponseEntity<?> getType(@PathVariable String typeId) throws IOException {
        try {
            return ResponseEntity.ok(wikiService.getType(typeId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/types/{typeId}")
    public ResponseEntity<?> updateType(@PathVariable String typeId, @RequestBody WikiType body) throws IOException {
        try {
            return ResponseEntity.ok(wikiService.updateType(typeId, body));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/types/{typeId}")
    public ResponseEntity<?> deleteType(@PathVariable String typeId) throws IOException {
        wikiService.deleteType(typeId);
        return ResponseEntity.ok(Map.of("status", "deleted", "typeId", typeId));
    }

    // ─── Entries ──────────────────────────────────────────────────────────────

    @GetMapping("/types/{typeId}/entries")
    public ResponseEntity<List<WikiEntry>> listEntries(@PathVariable String typeId) throws IOException {
        return ResponseEntity.ok(wikiService.listEntries(typeId));
    }

    @PostMapping("/types/{typeId}/entries")
    public ResponseEntity<?> createEntry(@PathVariable String typeId, @RequestBody Map<String, String> body) throws IOException {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        try {
            return ResponseEntity.ok(wikiService.createEntry(typeId, name));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/types/{typeId}/entries/{entryId}")
    public ResponseEntity<?> getEntry(@PathVariable String typeId, @PathVariable String entryId) throws IOException {
        try {
            return ResponseEntity.ok(wikiService.getEntry(typeId, entryId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/types/{typeId}/entries/{entryId}")
    public ResponseEntity<?> updateEntry(
            @PathVariable String typeId,
            @PathVariable String entryId,
            @RequestBody Map<String, Object> body) throws IOException {
        @SuppressWarnings("unchecked")
        Map<String, String> values = (Map<String, String>) body.get("values");
        if (values == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "values is required"));
        }
        try {
            return ResponseEntity.ok(wikiService.updateEntry(typeId, entryId, values));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/types/{typeId}/entries/{entryId}")
    public ResponseEntity<?> deleteEntry(@PathVariable String typeId, @PathVariable String entryId) throws IOException {
        wikiService.deleteEntry(typeId, entryId);
        return ResponseEntity.ok(Map.of("status", "deleted", "entryId", entryId));
    }
}
