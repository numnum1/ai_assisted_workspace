package com.assistant.service;

import com.assistant.model.WikiEntry;
import com.assistant.model.WikiFieldDef;
import com.assistant.model.WikiType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.text.Normalizer;
import java.util.*;
import java.util.stream.Stream;

@Service
public class WikiService {

    private static final String WIKI_DIR = ".wiki";
    private static final String TYPES_DIR = ".wiki/types";
    private static final String ENTRIES_DIR = ".wiki/entries";

    private final FileService fileService;
    private final ObjectMapper objectMapper;

    public WikiService(FileService fileService, ObjectMapper objectMapper) {
        this.fileService = fileService;
        this.objectMapper = objectMapper;
    }

    // ─── Path helpers ─────────────────────────────────────────────────────────

    private Path wikiRoot() {
        return fileService.getProjectRoot().resolve(WIKI_DIR);
    }

    private Path typesDir() {
        return fileService.getProjectRoot().resolve(TYPES_DIR);
    }

    private Path entriesDir() {
        return fileService.getProjectRoot().resolve(ENTRIES_DIR);
    }

    private Path typeFile(String typeId) {
        return typesDir().resolve(typeId + ".json");
    }

    private Path entryDir(String typeId) {
        return entriesDir().resolve(typeId);
    }

    private Path entryFile(String typeId, String entryId) {
        return entryDir(typeId).resolve(entryId + ".json");
    }

    private void ensureTypesDir() throws IOException {
        Files.createDirectories(typesDir());
    }

    private void ensureEntryDir(String typeId) throws IOException {
        Files.createDirectories(entryDir(typeId));
    }

    // ─── ID generation ────────────────────────────────────────────────────────

    private String slugify(String name) {
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return normalized.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }

    private String uniqueTypeId(String base) throws IOException {
        String id = base;
        int counter = 2;
        while (Files.exists(typeFile(id))) {
            id = base + "-" + counter++;
        }
        return id;
    }

    private String uniqueEntryId(String typeId, String base) throws IOException {
        String id = base;
        int counter = 2;
        while (Files.exists(entryFile(typeId, id))) {
            id = base + "-" + counter++;
        }
        return id;
    }

    // ─── Type CRUD ────────────────────────────────────────────────────────────

    public List<WikiType> listTypes() throws IOException {
        if (!Files.isDirectory(typesDir())) {
            return Collections.emptyList();
        }
        List<WikiType> result = new ArrayList<>();
        try (Stream<Path> files = Files.list(typesDir())) {
            List<Path> sorted = files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path p : sorted) {
                String content = Files.readString(p);
                result.add(objectMapper.readValue(content, WikiType.class));
            }
        }
        return result;
    }

    public WikiType getType(String typeId) throws IOException {
        Path file = typeFile(typeId);
        if (!Files.exists(file)) {
            throw new NoSuchElementException("Wiki type not found: " + typeId);
        }
        return objectMapper.readValue(Files.readString(file), WikiType.class);
    }

    public WikiType createType(String name) throws IOException {
        return createType(name, null);
    }

    public WikiType createType(String name, List<WikiFieldDef> fields) throws IOException {
        ensureTypesDir();
        String id = uniqueTypeId(slugify(name.isBlank() ? "type" : name));
        List<WikiFieldDef> resolvedFields = (fields != null && !fields.isEmpty())
                ? new ArrayList<>(fields)
                : List.of(
                    new WikiFieldDef("name", "Name", "input", "Name...", ""),
                    new WikiFieldDef("description", "Beschreibung", "textarea", "Beschreibung...", "")
                  );
        WikiType type = new WikiType(id, name, resolvedFields);
        Files.writeString(typeFile(id), objectMapper.writeValueAsString(type));
        return type;
    }

    public WikiType updateType(String typeId, WikiType updated) throws IOException {
        if (!Files.exists(typeFile(typeId))) {
            throw new NoSuchElementException("Wiki type not found: " + typeId);
        }
        updated.setId(typeId);
        Files.writeString(typeFile(typeId), objectMapper.writeValueAsString(updated));
        return updated;
    }

    public void deleteType(String typeId) throws IOException {
        Path tFile = typeFile(typeId);
        if (Files.exists(tFile)) {
            Files.delete(tFile);
        }
        Path eDir = entryDir(typeId);
        if (Files.isDirectory(eDir)) {
            deleteRecursively(eDir);
        }
    }

    // ─── Entry CRUD ───────────────────────────────────────────────────────────

    public List<WikiEntry> listEntries(String typeId) throws IOException {
        Path dir = entryDir(typeId);
        if (!Files.isDirectory(dir)) {
            return Collections.emptyList();
        }
        List<WikiEntry> result = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            List<Path> sorted = files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path p : sorted) {
                String content = Files.readString(p);
                result.add(objectMapper.readValue(content, WikiEntry.class));
            }
        }
        return result;
    }

    public WikiEntry getEntry(String typeId, String entryId) throws IOException {
        Path file = entryFile(typeId, entryId);
        if (!Files.exists(file)) {
            throw new NoSuchElementException("Wiki entry not found: " + typeId + "/" + entryId);
        }
        return objectMapper.readValue(Files.readString(file), WikiEntry.class);
    }

    public WikiEntry createEntry(String typeId, String name) throws IOException {
        WikiType type = getType(typeId);
        ensureEntryDir(typeId);
        String id = uniqueEntryId(typeId, slugify(name.isBlank() ? "entry" : name));
        Map<String, String> values = new LinkedHashMap<>();
        for (WikiFieldDef field : type.getFields()) {
            values.put(field.getKey(), field.getDefaultValue() != null ? field.getDefaultValue() : "");
        }
        if (values.containsKey("name")) {
            values.put("name", name);
        }
        WikiEntry entry = new WikiEntry(id, typeId, values);
        Files.writeString(entryFile(typeId, id), objectMapper.writeValueAsString(entry));
        return entry;
    }

    public WikiEntry updateEntry(String typeId, String entryId, Map<String, String> values) throws IOException {
        Path file = entryFile(typeId, entryId);
        if (!Files.exists(file)) {
            throw new NoSuchElementException("Wiki entry not found: " + typeId + "/" + entryId);
        }
        WikiEntry entry = objectMapper.readValue(Files.readString(file), WikiEntry.class);
        entry.setValues(values);
        Files.writeString(file, objectMapper.writeValueAsString(entry));
        return entry;
    }

    public void deleteEntry(String typeId, String entryId) throws IOException {
        Path file = entryFile(typeId, entryId);
        if (Files.exists(file)) {
            Files.delete(file);
        }
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private void deleteRecursively(Path path) throws IOException {
        Files.walkFileTree(path, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }
            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                if (exc != null) throw exc;
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }
}
