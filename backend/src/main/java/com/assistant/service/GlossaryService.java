package com.assistant.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * Service for managing the project glossary at .assistant/glossary.md.
 * The glossary is a single Markdown file containing vocabulary definitions
 * that are automatically injected into every AI chat context.
 */
@Service
public class GlossaryService {

    private static final Logger log = LoggerFactory.getLogger(GlossaryService.class);
    private static final String GLOSSARY_FILE = "glossary.md";

    private final ProjectConfigService projectConfigService;

    public GlossaryService(ProjectConfigService projectConfigService) {
        this.projectConfigService = projectConfigService;
    }

    private Path glossaryPath() {
        return projectConfigService.getAssistantDir().resolve(GLOSSARY_FILE);
    }

    /**
     * Returns the glossary content, or null if the project is not initialized
     * or the glossary file does not exist.
     */
    public String readGlossary() {
        log.trace("Received request to read glossary");
        if (!projectConfigService.hasProjectConfig()) {
            log.trace("Project not initialized, no glossary available");
            return null;
        }
        Path path = glossaryPath();
        if (!Files.exists(path)) {
            log.trace("Glossary file does not exist at {}", path);
            return null;
        }
        try {
            String content = Files.readString(path);
            log.trace("Finished reading glossary ({} chars)", content.length());
            return content;
        } catch (IOException e) {
            log.warn("Could not read glossary file: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Writes the full glossary content.
     */
    public void writeGlossary(String content) throws IOException {
        log.trace("Received request to write glossary");
        Path path = glossaryPath();
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        log.trace("Finished writing glossary");
    }

    /**
     * Appends a new term+definition entry to the glossary.
     * Creates the file if it doesn't exist.
     */
    public void addEntry(String term, String definition) throws IOException {
        log.trace("Received request to add glossary entry: {}", term);
        Path path = glossaryPath();
        Files.createDirectories(path.getParent());

        String entry = "\n- **" + term.trim() + "**: " + definition.trim() + "\n";

        if (!Files.exists(path)) {
            String initial = "## Arbeitsbegriffe\n" + entry;
            Files.writeString(path, initial, StandardOpenOption.CREATE_NEW);
        } else {
            Files.writeString(path, entry, StandardOpenOption.APPEND);
        }
        log.trace("Finished adding glossary entry: {}", term);
    }

    /**
     * Returns true if the glossary file exists and has content.
     */
    public boolean hasGlossary() {
        if (!projectConfigService.hasProjectConfig()) return false;
        Path path = glossaryPath();
        try {
            return Files.exists(path) && Files.size(path) > 0;
        } catch (IOException e) {
            return false;
        }
    }
}
