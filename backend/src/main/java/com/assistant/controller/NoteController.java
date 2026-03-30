package com.assistant.controller;

import com.assistant.model.Note;
import com.assistant.service.NoteService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private static final Logger log = LoggerFactory.getLogger(NoteController.class);

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    // ─── Free notes ───────────────────────────────────────────────────────────

    @PostMapping("/free")
    public ResponseEntity<?> saveFreeNote(@RequestBody Note note) {
        try {
            Note saved = noteService.saveFreeNote(note);
            return ResponseEntity.ok(saved);
        } catch (IOException e) {
            log.error("Error saving free note", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/free")
    public ResponseEntity<?> listFreeNotes() {
        try {
            List<Note> notes = noteService.listFreeNotes();
            return ResponseEntity.ok(notes);
        } catch (IOException e) {
            log.error("Error listing free notes", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/free/{id}")
    public ResponseEntity<?> deleteFreeNote(@PathVariable String id) {
        try {
            noteService.deleteFreeNote(id);
            return ResponseEntity.ok(Map.of("status", "deleted", "id", id));
        } catch (IOException e) {
            log.error("Error deleting free note: {}", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ─── Entry-attached notes ─────────────────────────────────────────────────

    @PostMapping("/entry/{typeId}/{entryId}")
    public ResponseEntity<?> attachNoteToEntry(
            @PathVariable String typeId,
            @PathVariable String entryId,
            @RequestBody Note note) {
        try {
            Note saved = noteService.attachNoteToEntry(note, typeId, entryId);
            return ResponseEntity.ok(saved);
        } catch (IOException e) {
            log.error("Error attaching note to entry {}/{}", typeId, entryId, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/entry/{typeId}/{entryId}")
    public ResponseEntity<?> listNotesForEntry(
            @PathVariable String typeId,
            @PathVariable String entryId) {
        try {
            List<Note> notes = noteService.listNotesForEntry(typeId, entryId);
            return ResponseEntity.ok(notes);
        } catch (IOException e) {
            log.error("Error listing notes for entry {}/{}", typeId, entryId, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/entry/{typeId}/{entryId}/{id}")
    public ResponseEntity<?> deleteEntryNote(
            @PathVariable String typeId,
            @PathVariable String entryId,
            @PathVariable String id) {
        try {
            noteService.deleteEntryNote(typeId, entryId, id);
            return ResponseEntity.ok(Map.of("status", "deleted", "id", id));
        } catch (IOException e) {
            log.error("Error deleting note {}/{}/{}", typeId, entryId, id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
