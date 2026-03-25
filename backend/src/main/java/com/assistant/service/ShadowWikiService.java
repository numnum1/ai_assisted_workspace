package com.assistant.service;

import com.assistant.config.AppConfig;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Manages shadow files stored under {@code .wiki/files/} in the project root.
 * Each shadow file mirrors the relative path of a project file:
 * <p>
 *   {@code characters/hero.md} → {@code .wiki/files/characters/hero.md}
 * </p>
 * Shadow files hold supplemental notes / metadata for their corresponding project file.
 * This service does NOT depend on {@link FileService} to avoid a circular dependency.
 */
@Service
public class ShadowWikiService {

    static final String SHADOW_DIR = ".wiki/files";

    private final AppConfig appConfig;

    public ShadowWikiService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    // ─── Path helpers ─────────────────────────────────────────────────────────

    private Path projectRoot() {
        String path = appConfig.getProject().getPath();
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("Project path not configured.");
        }
        return Path.of(path);
    }

    private Path shadowRoot() {
        return projectRoot().resolve(SHADOW_DIR);
    }

    private Path shadowPath(String projectRelativePath) {
        return shadowRoot().resolve(projectRelativePath.replace('\\', '/'));
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    public boolean exists(String projectRelativePath) {
        try {
            Path p = shadowPath(projectRelativePath).normalize();
            return Files.isRegularFile(p) && p.startsWith(shadowRoot());
        } catch (Exception e) {
            return false;
        }
    }

    public String read(String projectRelativePath) throws IOException {
        Path file = resolveAndValidate(projectRelativePath);
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    public void write(String projectRelativePath, String content) throws IOException {
        Path root = shadowRoot();
        Path file = root.resolve(projectRelativePath.replace('\\', '/')).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Access denied: path escapes shadow root");
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    public void delete(String projectRelativePath) throws IOException {
        if (!exists(projectRelativePath)) return;
        Path file = resolveAndValidate(projectRelativePath);
        Files.delete(file);
    }

    /**
     * Lists all shadow files as project-relative paths (same paths as the corresponding project files).
     * Returns an empty list if {@code .wiki/files/} does not exist.
     */
    public List<String> listAll() throws IOException {
        Path root = shadowRoot();
        if (!Files.isDirectory(root)) {
            return Collections.emptyList();
        }
        List<String> result = new ArrayList<>();
        try (Stream<Path> paths = Files.walk(root)) {
            List<Path> files = paths
                    .filter(Files::isRegularFile)
                    .sorted(Comparator.comparing(p -> root.relativize(p).toString()))
                    .toList();
            for (Path p : files) {
                String rel = root.relativize(p).toString().replace('\\', '/');
                result.add(rel);
            }
        }
        return result;
    }

    /** Called when a project file is renamed. Renames the shadow file if it exists. */
    public void renameFileIfExists(String oldRelativePath, String newName) {
        try {
            if (!exists(oldRelativePath)) return;
            Path oldShadow = resolveAndValidate(oldRelativePath);
            Path newShadow = oldShadow.getParent().resolve(newName).normalize();
            if (newShadow.startsWith(shadowRoot())) {
                Files.move(oldShadow, newShadow);
            }
        } catch (Exception ignored) {
            // Best-effort: don't fail the project file rename
        }
    }

    /** Called when a project directory is renamed. Renames the shadow directory if it exists. */
    public void renameDirIfExists(String oldRelativePath, String newName) {
        try {
            Path root = shadowRoot();
            Path oldDir = root.resolve(oldRelativePath.replace('\\', '/')).normalize();
            if (!oldDir.startsWith(root) || !Files.isDirectory(oldDir)) return;
            Path newDir = oldDir.getParent().resolve(newName).normalize();
            if (newDir.startsWith(root)) {
                Files.move(oldDir, newDir);
            }
        } catch (Exception ignored) {
            // Best-effort
        }
    }

    /** Called when a project file or directory is deleted. Deletes its shadow counterpart if present. */
    public void deleteIfExists(String projectRelativePath) {
        try {
            Path root = shadowRoot();
            Path shadow = root.resolve(projectRelativePath.replace('\\', '/')).normalize();
            if (!shadow.startsWith(root) || !Files.exists(shadow)) return;
            if (Files.isDirectory(shadow)) {
                deleteRecursively(shadow);
            } else {
                Files.delete(shadow);
            }
        } catch (Exception ignored) {
            // Best-effort
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private Path resolveAndValidate(String projectRelativePath) throws IOException {
        Path root = shadowRoot();
        Path file = root.resolve(projectRelativePath.replace('\\', '/')).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Access denied: path escapes shadow root");
        }
        if (!Files.exists(file)) {
            throw new NoSuchFileException(projectRelativePath);
        }
        return file;
    }

    private void deleteRecursively(Path path) throws IOException {
        Files.walkFileTree(path, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
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
