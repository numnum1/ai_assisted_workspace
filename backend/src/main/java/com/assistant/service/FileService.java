package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.FileNode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Service
public class FileService {

    private final AppConfig appConfig;

    public FileService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    public Path getProjectRoot() {
        String path = appConfig.getProject().getPath();
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("Project path not configured. Set app.project.path in application.yml");
        }
        Path root = Path.of(path);
        if (!Files.isDirectory(root)) {
            throw new IllegalStateException("Project path does not exist: " + root);
        }
        return root;
    }

    public FileNode getFileTree() throws IOException {
        Path root = getProjectRoot();
        return buildTree(root, root);
    }

    private FileNode buildTree(Path current, Path root) throws IOException {
        String relativePath = root.relativize(current).toString().replace('\\', '/');
        if (relativePath.isEmpty()) {
            relativePath = ".";
        }

        FileNode node = new FileNode(current.getFileName().toString(), relativePath, Files.isDirectory(current));

        if (Files.isDirectory(current)) {
            try (Stream<Path> entries = Files.list(current)) {
                entries
                    .filter(p -> !isHidden(p))
                    .sorted(Comparator
                        .comparing((Path p) -> !Files.isDirectory(p))
                        .thenComparing(p -> p.getFileName().toString().toLowerCase()))
                    .forEach(p -> {
                        try {
                            node.getChildren().add(buildTree(p, root));
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
            }
        }

        return node;
    }

    private boolean isHidden(Path path) {
        String name = path.getFileName().toString();
        return name.startsWith(".") || name.equals("node_modules") || name.equals("target");
    }

    public String readFile(String relativePath) throws IOException {
        Path file = resolveAndValidate(relativePath);
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    public void writeFile(String relativePath, String content) throws IOException {
        Path file = resolveAndValidate(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    public boolean fileExists(String relativePath) {
        try {
            Path file = getProjectRoot().resolve(relativePath).normalize();
            return Files.exists(file) && file.startsWith(getProjectRoot());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Reads lines from a file. Both start and end are 1-based inclusive.
     */
    public String readFileLines(String relativePath, int startLine, int endLine) throws IOException {
        Path file = resolveAndValidate(relativePath);
        var lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        int start = Math.max(0, startLine - 1);
        int end = Math.min(lines.size(), endLine);
        return String.join("\n", lines.subList(start, end));
    }

    public int countLines(String relativePath) throws IOException {
        Path file = resolveAndValidate(relativePath);
        try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
            return (int) lines.count();
        }
    }

    public boolean isDirectory(String relativePath) {
        try {
            Path path = getProjectRoot().resolve(relativePath).normalize();
            return Files.isDirectory(path) && path.startsWith(getProjectRoot());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Lists all files recursively within a directory, filtering hidden entries.
     * Returns relative paths (forward-slash separated) under the project root.
     */
    public List<String> listFiles(String relativePath) throws IOException {
        Path root = getProjectRoot();
        Path dir = root.resolve(relativePath).normalize();
        if (!dir.startsWith(root)) {
            throw new IOException("Access denied: path escapes project root");
        }
        if (!Files.isDirectory(dir)) {
            throw new IOException("Not a directory: " + relativePath);
        }

        List<String> result = new ArrayList<>();
        collectFiles(dir, root, result);
        return result;
    }

    private void collectFiles(Path current, Path root, List<String> result) throws IOException {
        try (Stream<Path> entries = Files.list(current)) {
            entries
                .filter(p -> !isHidden(p))
                .sorted(Comparator
                    .comparing((Path p) -> !Files.isDirectory(p))
                    .thenComparing(p -> p.getFileName().toString().toLowerCase()))
                .forEach(p -> {
                    if (Files.isDirectory(p)) {
                        try {
                            collectFiles(p, root, result);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    } else {
                        result.add(root.relativize(p).toString().replace('\\', '/'));
                    }
                });
        }
    }

    /**
     * Searches file and folder names/paths for a query string (case-insensitive).
     * Returns relative paths of all matching entries.
     */
    public List<String> searchFiles(String query) throws IOException {
        List<String> results = new ArrayList<>();
        String lowerQuery = query.toLowerCase();
        collectSearchResults(getProjectRoot(), getProjectRoot(), lowerQuery, results);
        return results;
    }

    private void collectSearchResults(Path current, Path root, String lowerQuery, List<String> results) throws IOException {
        try (Stream<Path> entries = Files.list(current)) {
            entries
                .filter(p -> !isHidden(p))
                .sorted(Comparator
                    .comparing((Path p) -> !Files.isDirectory(p))
                    .thenComparing(p -> p.getFileName().toString().toLowerCase()))
                .forEach(p -> {
                    String relative = root.relativize(p).toString().replace('\\', '/');
                    if (relative.toLowerCase().contains(lowerQuery)) {
                        results.add(relative + (Files.isDirectory(p) ? "/" : ""));
                    }
                    if (Files.isDirectory(p)) {
                        try {
                            collectSearchResults(p, root, lowerQuery, results);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    }
                });
        }
    }

    private Path resolveAndValidate(String relativePath) throws IOException {
        Path root = getProjectRoot();
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Access denied: path escapes project root");
        }
        if (!Files.exists(file)) {
            throw new NoSuchFileException(relativePath);
        }
        return file;
    }
}
