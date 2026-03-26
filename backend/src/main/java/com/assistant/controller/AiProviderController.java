package com.assistant.controller;

import com.assistant.model.AiProviderPublic;
import com.assistant.model.AiProviderRequest;
import com.assistant.model.AiProvidersListResponse;
import com.assistant.service.AiProviderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/llms")
public class AiProviderController {

    private final AiProviderService aiProviderService;

    public AiProviderController(AiProviderService aiProviderService) {
        this.aiProviderService = aiProviderService;
    }

    @GetMapping
    public ResponseEntity<AiProvidersListResponse> list() {
        return ResponseEntity.ok(aiProviderService.listPublic());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody AiProviderRequest body) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(aiProviderService.create(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody AiProviderRequest body) {
        try {
            return ResponseEntity.ok(aiProviderService.update(id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        try {
            aiProviderService.delete(id);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /** Set this LLM entry as the currently active one. */
    @PostMapping("/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable String id) {
        try {
            aiProviderService.activate(id);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}
