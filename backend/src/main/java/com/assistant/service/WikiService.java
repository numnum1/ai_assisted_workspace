package com.assistant.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Wiki service that reads and searches Markdown files in the /wiki/ directory
 * at the project root. Entries are plain Markdown files — no JSON schema.
 */
@Service
public class WikiService {

    private static final Logger log = LoggerFactory.getLogger(WikiService.class);
    private static final String WIKI_DIR = "wiki";

    private final FileService fileService;

    public WikiService(FileService fileService) {
        this.fileService = fileService;
    }

    private Path wikiRoot() {
        return fileService.getProjectRoot().resolve(WIKI_DIR);
    }

    // ─── Listing ──────────────────────────────────────────────────────────────

    /**
     * Returns relative paths (from wiki root) of all .md files in /wiki/.
     * E.g. "characters/lupusregina.md"
     */
    public List<String> listWikiFiles() throws IOException {
        log.trace("Received request to list wiki files");
        Path root = wikiRoot();
        if (!Files.isDirectory(root)) {
            log.trace("Wiki directory does not exist, returning empty list");
            return Collections.emptyList();
        }
        List<String> result = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (file.getFileName().toString().endsWith(".md")) {
                    result.add(root.relativize(file).toString().replace('\\', '/'));
                }
                return FileVisitResult.CONTINUE;
            }
        });
        result.sort(String::compareTo);
        log.trace("Finished listing wiki files: {} found", result.size());
        return result;
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /**
     * Reads a wiki file by relative path (e.g. "characters/lupusregina.md").
     * Strips the .md extension if not supplied.
     */
    public String readWikiFile(String relativePath) throws IOException {
        log.trace("Received request to read wiki file: {}", relativePath);
        String normalized = normalize(relativePath);
        Path file = wikiRoot().resolve(normalized);
        if (!Files.exists(file)) {
            throw new NoSuchElementException("Wiki file not found: " + relativePath);
        }
        String content = Files.readString(file);
        log.trace("Finished reading wiki file: {}", relativePath);
        return content;
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    public record WikiSearchHit(String path, String title, String snippet) {}

    /**
     * Searches all wiki files for the given query (case-insensitive) in filename and content.
     * Returns up to maxResults hits.
     */
    public List<WikiSearchHit> searchWiki(String query, int maxResults) throws IOException {
        log.trace("Received request to search wiki for: {}", query);
        List<String> files = listWikiFiles();
        String lower = query.toLowerCase();
        List<WikiSearchHit> hits = new ArrayList<>();

        for (String relPath : files) {
            if (hits.size() >= maxResults) break;
            Path file = wikiRoot().resolve(relPath);
            String content;
            try {
                content = Files.readString(file);
            } catch (IOException e) {
                log.warn("Could not read wiki file: {}", relPath);
                continue;
            }

            String filename = Paths.get(relPath).getFileName().toString();
            String filenameBase = filename.endsWith(".md") ? filename.substring(0, filename.length() - 3) : filename;
            boolean nameMatch = filenameBase.toLowerCase().contains(lower);
            boolean contentMatch = content.toLowerCase().contains(lower);

            if (nameMatch || contentMatch) {
                String title = extractTitle(content, filenameBase);
                String snippet = contentMatch ? extractSnippet(content, lower) : "";
                hits.add(new WikiSearchHit(relPath, title, snippet));
            }
        }

        log.trace("Finished wiki search for '{}': {} hits", query, hits.size());
        return hits;
    }

    // ─── AI formatting ────────────────────────────────────────────────────────

    /**
     * Formats a wiki file for inclusion in an AI prompt.
     */
    public String formatForAi(String relativePath, String content) {
        return "Wiki: " + relativePath + "\n\n" + content;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private String normalize(String path) {
        String p = path.replace('\\', '/').trim();
        if (!p.endsWith(".md")) p = p + ".md";
        return p;
    }

    private String extractTitle(String content, String fallback) {
        for (String line : content.split("\n", 20)) {
            String trimmed = line.trim();
            if (trimmed.startsWith("# ")) return trimmed.substring(2).trim();
            if (trimmed.startsWith("name:")) {
                String value = trimmed.substring(5).trim();
                if (!value.isBlank()) return value;
            }
        }
        return fallback;
    }

    private String extractSnippet(String content, String lowerQuery) {
        String lowerContent = content.toLowerCase();
        int idx = lowerContent.indexOf(lowerQuery);
        if (idx < 0) return "";
        int start = Math.max(0, idx - 40);
        int end = Math.min(content.length(), idx + lowerQuery.length() + 80);
        String snippet = content.substring(start, end).replace('\n', ' ').trim();
        if (start > 0) snippet = "..." + snippet;
        if (end < content.length()) snippet = snippet + "...";
        return snippet;
    }

    // ─── Legacy migration helper ───────────────────────────────────────────────

    /**
     * Returns the legacy .wiki/entries path for migration purposes.
     */
    public Path getLegacyEntriesDir() {
        return fileService.getProjectRoot().resolve(".wiki").resolve("entries");
    }
}
