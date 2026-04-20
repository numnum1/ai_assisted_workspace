package com.assistant.file_services;

import com.assistant.project.ProjectConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Service for managing the project glossary at .assistant/glossary.md.
 * The glossary is a single Markdown file containing vocabulary definitions
 * that are automatically injected into every AI chat context.
 */
@Service
public class GlossaryService {

    private static final Logger log = LoggerFactory.getLogger(GlossaryService.class);
    private static final String GLOSSARY_FILE = "glossary.md";

    /**
     * Matches a single-line glossary entry as produced by {@link #addEntry(String, String)}:
     * {@code - **term**: definition} (optional leading whitespace).
     * Terms containing {@code **} are not supported by this pattern.
     */
    private static final Pattern ENTRY_LINE = Pattern.compile("^\\s*-\\s*\\*\\*(.+?)\\*\\*:\\s*(.*)$");

    private final ProjectConfigService projectConfigService;

    public GlossaryService(ProjectConfigService projectConfigService) {
        this.projectConfigService = projectConfigService;
    }

    private Path glossaryPath() {
        return projectConfigService.getAssistantDir().resolve(GLOSSARY_FILE);
    }

    /**
     * One glossary list item (term + definition on one line in the file).
     */
    public record GlossaryEntry(String term, String definition) {}

    /**
     * Split file content into markdown before the recognized entry lines and structured entries.
     */
    public record GlossaryParseResult(String prefixMarkdown, List<GlossaryEntry> entries) {
        public static GlossaryParseResult parse(String markdown) {
            if (markdown == null || markdown.isEmpty()) {
                return new GlossaryParseResult("", List.of());
            }
            List<String> lines = markdown.lines().toList();
            StringBuilder prefix = new StringBuilder();
            List<GlossaryEntry> entries = new ArrayList<>();
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher m = ENTRY_LINE.matcher(line);
                if (m.matches()) {
                    entries.add(new GlossaryEntry(m.group(1).trim(), m.group(2).trim()));
                } else {
                    if (prefix.length() > 0) {
                        prefix.append('\n');
                    }
                    prefix.append(line);
                }
            }
            return new GlossaryParseResult(prefix.toString(), List.copyOf(entries));
        }
    }

    /**
     * Parses the given glossary markdown (same rules as {@link #readGlossary()} content).
     */
    public GlossaryParseResult parseGlossaryContent(String markdown) {
        log.trace("Received request to parse glossary content");
        GlossaryParseResult r = GlossaryParseResult.parse(markdown);
        log.trace("Finished parsing glossary ({} entries)", r.entries().size());
        return r;
    }

    /**
     * Removes all lines that match the glossary entry pattern for the given term (trimmed,
     * case-sensitive equality on the term).
     *
     * @return number of lines removed, {@code -1} if project not initialized,
     *         {@code -2} if glossary file does not exist, {@code 0} if term did not match any line
     */
    public int removeEntry(String term) throws IOException {
        log.trace("Received request to remove glossary entry: {}", term);
        if (!projectConfigService.hasProjectConfig()) {
            log.trace("Project not initialized, cannot remove glossary entry");
            return -1;
        }
        Path path = glossaryPath();
        if (!Files.exists(path)) {
            log.trace("Glossary file does not exist at {}", path);
            return -2;
        }
        String needle = term.trim();
        List<String> lines = Files.readAllLines(path);
        List<String> kept = new ArrayList<>(lines.size());
        int removed = 0;
        for (String line : lines) {
            Matcher m = ENTRY_LINE.matcher(line);
            if (m.matches() && m.group(1).trim().equals(needle)) {
                removed++;
            } else {
                kept.add(line);
            }
        }
        if (removed == 0) {
            log.trace("Finished remove glossary entry: no line matched term {}", term);
            return 0;
        }
        String out = kept.isEmpty() ? "" : String.join("\n", kept) + "\n";
        writeGlossary(out);
        log.trace("Finished removing glossary entry: {}, {} line(s)", term, removed);
        return removed;
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
