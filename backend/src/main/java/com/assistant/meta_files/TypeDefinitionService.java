package com.assistant.meta_files;

import com.assistant.config.AppConfig;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * Loads type definitions for structured file types (.scene.json, .chapter.json, etc.).
 * Built-in definitions live in classpath:types/*.type.json.
 * Project-specific overrides live in .assistant/types/*.type.json.
 */
@Service
public class TypeDefinitionService {

    private static final Logger log = LoggerFactory.getLogger(TypeDefinitionService.class);
    private static final String TYPES_DIR = "types";
    private static final String ASSISTANT_DIR = ".assistant";

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TypeDefinitionService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    /**
     * Returns all available type definitions. Project-specific definitions override built-ins by id.
     */
    public List<Map<String, Object>> getAllTypeDefinitions() {
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();

        for (Map<String, Object> def : loadBuiltinTypes()) {
            String id = (String) def.get("id");
            if (id != null) byId.put(id, def);
        }

        for (Map<String, Object> def : loadProjectTypes()) {
            String id = (String) def.get("id");
            if (id != null) byId.put(id, def);
        }

        return new ArrayList<>(byId.values());
    }

    /**
     * Finds a type definition by file extension (e.g. ".scene.json").
     */
    public Optional<Map<String, Object>> findByExtension(String fileExtension) {
        return getAllTypeDefinitions().stream()
                .filter(def -> fileExtension.equals(def.get("fileExtension")))
                .findFirst();
    }

    /**
     * Finds a type definition by its id (e.g. "scene").
     */
    public Optional<Map<String, Object>> findById(String id) {
        return getAllTypeDefinitions().stream()
                .filter(def -> id.equals(def.get("id")))
                .findFirst();
    }

    /**
     * Detects if a filename belongs to a known typed file type.
     * Returns the matching extension (e.g. ".scene.json") or null.
     */
    public String detectTypedExtension(String filename) {
        for (Map<String, Object> def : getAllTypeDefinitions()) {
            String ext = (String) def.get("fileExtension");
            if (ext != null && filename.endsWith(ext)) {
                return ext;
            }
        }
        return null;
    }

    private List<Map<String, Object>> loadBuiltinTypes() {
        List<Map<String, Object>> result = new ArrayList<>();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources("classpath:types/*.type.json");
            for (Resource resource : resources) {
                try (InputStream is = resource.getInputStream()) {
                    Map<String, Object> parsed = objectMapper.readValue(is,
                            new TypeReference<>() {});
                    result.add(parsed);
                } catch (IOException e) {
                    log.warn("Could not load built-in type from {}: {}", resource.getFilename(), e.getMessage());
                }
            }
        } catch (IOException e) {
            log.warn("Could not scan classpath types: {}", e.getMessage());
        }
        return result;
    }

    private List<Map<String, Object>> loadProjectTypes() {
        String projectPath = appConfig.getProject().getPath();
        if (projectPath == null || projectPath.isBlank()) return List.of();

        Path typesDir = Path.of(projectPath).resolve(ASSISTANT_DIR).resolve(TYPES_DIR);
        if (!Files.isDirectory(typesDir)) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        try (Stream<Path> entries = Files.list(typesDir)) {
            entries
                .filter(p -> p.getFileName().toString().endsWith(".type.json"))
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .forEach(p -> {
                    try {
                        String json = Files.readString(p, StandardCharsets.UTF_8);
                        Map<String, Object> parsed = objectMapper.readValue(json,
                                new TypeReference<>() {});
                        result.add(parsed);
                    } catch (IOException e) {
                        log.warn("Could not load project type from {}: {}", p, e.getMessage());
                    }
                });
        } catch (IOException e) {
            log.warn("Could not list project types directory: {}", e.getMessage());
        }
        return result;
    }

    public Map<String, Object> parseJsonToMap(String json) throws IOException {
        return objectMapper.readValue(json, new TypeReference<>() {});
    }

    public String toJson(Object value) throws IOException {
        return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
    }
}
