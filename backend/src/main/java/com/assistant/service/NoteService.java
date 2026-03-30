package com.assistant.service;

import com.assistant.model.Note;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Service
public class NoteService {

    private static final String NOTES_FREE_DIR = ".wiki/notes/free";
    private static final String NOTES_ENTRY_DIR = ".wiki/notes/entry";

    private final FileService fileService;
    private final ObjectMapper objectMapper;

    public NoteService(FileService fileService, ObjectMapper objectMapper) {
        this.fileService = fileService;
        this.objectMapper = objectMapper;
    }

    // ─── Path helpers ─────────────────────────────────────────────────────────

    private Path freeDir() {
        return fileService.getProjectRoot().resolve(NOTES_FREE_DIR);
    }

    private Path entryDir(String typeId, String entryId) {
        return fileService.getProjectRoot().resolve(NOTES_ENTRY_DIR).resolve(typeId).resolve(entryId);
    }

    private Path freeNoteFile(String id) {
        return freeDir().resolve(id + ".json");
    }

    private Path entryNoteFile(String typeId, String entryId, String id) {
        return entryDir(typeId, entryId).resolve(id + ".json");
    }

    // ─── Free notes ───────────────────────────────────────────────────────────

    public Note saveFreeNote(Note note) throws IOException {
        Files.createDirectories(freeDir());
        Files.writeString(freeNoteFile(note.getId()), objectMapper.writeValueAsString(note));
        return note;
    }

    public List<Note> listFreeNotes() throws IOException {
        if (!Files.isDirectory(freeDir())) {
            return Collections.emptyList();
        }
        return readNotesFromDir(freeDir());
    }

    public void deleteFreeNote(String id) throws IOException {
        Path file = freeNoteFile(id);
        if (Files.exists(file)) {
            Files.delete(file);
        }
    }

    // ─── Entry-attached notes ─────────────────────────────────────────────────

    public Note attachNoteToEntry(Note note, String typeId, String entryId) throws IOException {
        Path dir = entryDir(typeId, entryId);
        Files.createDirectories(dir);
        Files.writeString(entryNoteFile(typeId, entryId, note.getId()), objectMapper.writeValueAsString(note));
        return note;
    }

    public List<Note> listNotesForEntry(String typeId, String entryId) throws IOException {
        Path dir = entryDir(typeId, entryId);
        if (!Files.isDirectory(dir)) {
            return Collections.emptyList();
        }
        return readNotesFromDir(dir);
    }

    public void deleteEntryNote(String typeId, String entryId, String id) throws IOException {
        Path file = entryNoteFile(typeId, entryId, id);
        if (Files.exists(file)) {
            Files.delete(file);
        }
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private List<Note> readNotesFromDir(Path dir) throws IOException {
        List<Note> result = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            List<Path> sorted = files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path p : sorted) {
                result.add(objectMapper.readValue(Files.readString(p), Note.class));
            }
        }
        return result;
    }
}
