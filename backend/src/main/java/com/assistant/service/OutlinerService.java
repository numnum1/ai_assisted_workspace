package com.assistant.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * Scans the chapters/ directory and builds a hierarchical outliner tree.
 * For each chapter folder, determines which .md and .scene.json/.chapter.json files exist.
 */
@Service
public class OutlinerService {

    private static final Logger log = LoggerFactory.getLogger(OutlinerService.class);
    private static final String CHAPTERS_DIR = "chapters";

    private final FileService fileService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OutlinerService(FileService fileService) {
        this.fileService = fileService;
    }

    public Map<String, Object> buildTree() {
        List<Map<String, Object>> chapters = new ArrayList<>();

        if (!fileService.isDirectory(CHAPTERS_DIR)) {
            return Map.of("chapters", chapters);
        }

        Path root = fileService.getProjectRoot();
        Path chaptersPath = root.resolve(CHAPTERS_DIR);

        try (Stream<Path> entries = Files.list(chaptersPath)) {
            entries
                .filter(Files::isDirectory)
                .filter(p -> !p.getFileName().toString().startsWith("."))
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .forEach(chapterDir -> {
                    try {
                        chapters.add(buildChapter(chapterDir, root));
                    } catch (IOException e) {
                        log.warn("Could not build chapter for {}: {}", chapterDir, e.getMessage());
                    }
                });
        } catch (IOException e) {
            log.error("Could not list chapters directory", e);
        }

        return Map.of("chapters", chapters);
    }

    private Map<String, Object> buildChapter(Path chapterDir, Path root) throws IOException {
        String relPath = root.relativize(chapterDir).toString().replace('\\', '/');
        String name = chapterDir.getFileName().toString();

        String chapterMetaFilename = name + ".chapter.json";
        Path chapterMetaPath = chapterDir.resolve(chapterMetaFilename);
        boolean hasMetadata = Files.exists(chapterMetaPath);
        String summary = null;

        if (hasMetadata) {
            summary = extractSummary(chapterMetaPath);
        }

        List<Map<String, Object>> scenes = buildScenes(chapterDir, root);

        Map<String, Object> chapter = new LinkedHashMap<>();
        chapter.put("path", relPath);
        chapter.put("name", name);
        chapter.put("hasMetadata", hasMetadata);
        chapter.put("metaPath", relPath + "/" + chapterMetaFilename);
        if (summary != null) chapter.put("summary", summary);
        chapter.put("scenes", scenes);
        return chapter;
    }

    private List<Map<String, Object>> buildScenes(Path chapterDir, Path root) throws IOException {
        List<Map<String, Object>> scenes = new ArrayList<>();
        Set<String> processedBases = new LinkedHashSet<>();

        // Collect all .md and .scene.json files
        List<Path> allFiles;
        try (Stream<Path> entries = Files.list(chapterDir)) {
            allFiles = entries
                .filter(p -> !Files.isDirectory(p))
                .filter(p -> !p.getFileName().toString().startsWith("."))
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .toList();
        }

        // Find all .md base names
        Set<String> mdBases = new LinkedHashSet<>();
        Set<String> metaBases = new LinkedHashSet<>();

        for (Path file : allFiles) {
            String filename = file.getFileName().toString();
            if (filename.endsWith(".scene.json")) {
                metaBases.add(filename.substring(0, filename.length() - ".scene.json".length()));
            } else if (filename.endsWith(".md")) {
                mdBases.add(filename.substring(0, filename.length() - ".md".length()));
            }
        }

        // Union of all bases
        Set<String> allBases = new LinkedHashSet<>();
        allBases.addAll(mdBases);
        allBases.addAll(metaBases);

        for (String base : allBases) {
            if (processedBases.contains(base)) continue;
            processedBases.add(base);

            boolean hasText = mdBases.contains(base);
            boolean hasMetadata = metaBases.contains(base);

            Path metaPath = chapterDir.resolve(base + ".scene.json");
            String summary = null;
            if (hasMetadata && Files.exists(metaPath)) {
                summary = extractSummary(metaPath);
            }

            String relPath = root.relativize(chapterDir).toString().replace('\\', '/');

            Map<String, Object> scene = new LinkedHashMap<>();
            scene.put("path", relPath + "/" + base);
            scene.put("name", base);
            scene.put("hasText", hasText);
            scene.put("hasMetadata", hasMetadata);
            scene.put("textPath", relPath + "/" + base + ".md");
            scene.put("metaPath", relPath + "/" + base + ".scene.json");
            if (summary != null) scene.put("summary", summary);
            scenes.add(scene);
        }

        return scenes;
    }

    /**
     * Extracts the "summary" field from a JSON file. Returns null if not found or on error.
     */
    private String extractSummary(Path jsonFile) {
        try {
            String content = Files.readString(jsonFile, StandardCharsets.UTF_8);
            Map<String, Object> data = objectMapper.readValue(content, new TypeReference<>() {});
            Object summary = data.get("summary");
            return summary instanceof String s ? s : null;
        } catch (Exception e) {
            log.debug("Could not extract summary from {}: {}", jsonFile, e.getMessage());
            return null;
        }
    }

    /**
     * Creates a new chapter folder. Optionally creates the .chapter.json metadata file.
     */
    public String createChapter(String name) throws IOException {
        String chapterPath = CHAPTERS_DIR + "/" + name;
        fileService.createDirectory(CHAPTERS_DIR, name);
        return chapterPath;
    }

    /**
     * Creates a new scene inside a chapter. Returns paths of created files.
     * chapterPath: e.g. "chapters/kapitel-07"
     */
    public Map<String, String> createScene(String chapterPath, String name, boolean withMetadata) throws IOException {
        Map<String, String> result = new LinkedHashMap<>();

        String textPath = chapterPath + "/" + name + ".md";
        String metaPath = chapterPath + "/" + name + ".scene.json";

        // Create .md file
        Path root = fileService.getProjectRoot();
        Path textFile = root.resolve(textPath).normalize();
        if (!textFile.startsWith(root)) throw new IOException("Access denied");
        if (!Files.exists(textFile)) {
            Files.createDirectories(textFile.getParent());
            Files.writeString(textFile, "", StandardCharsets.UTF_8);
        }
        result.put("textPath", textPath);

        // Optionally create .scene.json
        if (withMetadata) {
            Path metaFile = root.resolve(metaPath).normalize();
            if (!metaFile.startsWith(root)) throw new IOException("Access denied");
            if (!Files.exists(metaFile)) {
                Files.writeString(metaFile, "{}", StandardCharsets.UTF_8);
            }
            result.put("metaPath", metaPath);
        }

        return result;
    }
}
