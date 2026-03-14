package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.FileNode;
import com.assistant.model.PlanningNode;
import org.springframework.stereotype.Service;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    public boolean isAssistantPath(String relativePath) {
        return relativePath != null && (relativePath.equals(".assistant") || relativePath.startsWith(".assistant/"));
    }

    public String readFile(String relativePath) throws IOException {
        Path file = resolveAndValidate(relativePath);
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    public void writeFile(String relativePath, String content) throws IOException {
        Path file = resolveForCreate(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    public void deleteFile(String relativePath) throws IOException {
        Path file = resolveAndValidate(relativePath);
        if (Files.isDirectory(file)) {
            deleteRecursively(file);
        } else {
            Files.delete(file);
        }
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

    public String createFile(String parentPath, String name) throws IOException {
        String relativePath = joinPath(parentPath, name);
        Path file = resolveForCreate(relativePath);
        if (Files.exists(file)) {
            throw new IOException("File already exists: " + relativePath);
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file, "", StandardCharsets.UTF_8);
        return relativePath;
    }

    public String createDirectory(String parentPath, String name) throws IOException {
        String relativePath = joinPath(parentPath, name);
        Path dir = resolveForCreate(relativePath);
        if (Files.exists(dir)) {
            throw new IOException("Directory already exists: " + relativePath);
        }
        Files.createDirectories(dir);
        return relativePath;
    }

    public String rename(String relativePath, String newName) throws IOException {
        if (relativePath == null || ".".equals(relativePath) || relativePath.isBlank()) {
            throw new IOException("Cannot rename project root");
        }
        if (newName == null || newName.isBlank()) {
            throw new IOException("New name is required");
        }
        if (newName.contains("/") || newName.contains("\\")) {
            throw new IOException("Name cannot contain path separators");
        }
        Path root = getProjectRoot();
        Path source = resolveAndValidate(relativePath);
        Path parent = source.getParent();
        if (parent == null || !parent.startsWith(root)) {
            throw new IOException("Cannot rename project root");
        }
        Path target = parent.resolve(newName).normalize();
        if (!target.startsWith(root)) {
            throw new IOException("Access denied: path escapes project root");
        }
        if (Files.exists(target)) {
            throw new IOException("Target already exists: " + newName);
        }
        Files.move(source, target);
        return root.relativize(target).toString().replace('\\', '/');
    }

    private String joinPath(String parent, String name) {
        if (parent == null || parent.isEmpty() || ".".equals(parent)) {
            return name;
        }
        return parent + "/" + name;
    }

    private Path resolveForCreate(String relativePath) throws IOException {
        Path root = getProjectRoot();
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Access denied: path escapes project root");
        }
        return file;
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

    /**
     * Opens the folder (or parent folder for files) in the system file explorer.
     */
    public void openInExplorer(String relativePath) throws IOException {
        Path root = getProjectRoot();
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Access denied: path escapes project root");
        }
        if (!Files.exists(file)) {
            throw new NoSuchFileException(relativePath);
        }
        Path folderToOpen = Files.isDirectory(file) ? file : file.getParent();
        if (folderToOpen == null) {
            throw new IOException("Cannot determine folder to open");
        }
        if (Desktop.isDesktopSupported()) {
            Desktop.getDesktop().open(folderToOpen.toFile());
        } else {
            throw new IOException("Desktop operations not supported on this system");
        }
    }

    // ── Planning outline ──────────────────────────────────────────────────────

    private static final String PLANNING_DIR = ".planning";
    private static final Pattern FM_KEY = Pattern.compile("^(\\w+):\\s*\"?([^\"\n]*)\"?\\s*$", Pattern.MULTILINE);

    public List<PlanningNode> getPlanningOutline() throws IOException {
        Path root = getProjectRoot();
        Path planningDir = root.resolve(PLANNING_DIR);
        if (!Files.isDirectory(planningDir)) {
            return Collections.emptyList();
        }
        return buildPlanningChildren(planningDir, root, Collections.emptyList());
    }

    private List<PlanningNode> buildPlanningChildren(Path dir, Path root, List<String> childOrder) throws IOException {
        List<Path> mdFiles;
        try (Stream<Path> entries = Files.list(dir)) {
            mdFiles = entries
                .filter(p -> !Files.isDirectory(p) && p.getFileName().toString().endsWith(".md"))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        }

        // Apply child_order sort: ordered entries first, then remaining alphabetically
        if (!childOrder.isEmpty()) {
            Map<String, Integer> orderIndex = new LinkedHashMap<>();
            for (int i = 0; i < childOrder.size(); i++) {
                orderIndex.put(childOrder.get(i).toLowerCase(), i);
            }
            mdFiles.sort(Comparator.comparingInt((Path p) -> {
                String name = p.getFileName().toString().toLowerCase();
                return orderIndex.getOrDefault(name, Integer.MAX_VALUE);
            }).thenComparing(p -> p.getFileName().toString().toLowerCase()));
        } else {
            mdFiles.sort(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()));
        }

        List<PlanningNode> nodes = new ArrayList<>();
        for (Path mdFile : mdFiles) {
            String content = "";
            try { content = Files.readString(mdFile, StandardCharsets.UTF_8); } catch (IOException ignored) {}
            Map<String, String> fm = parseFrontmatter(content);
            List<String> ownChildOrder = parseChildOrder(content);

            String relativePath = root.relativize(mdFile).toString().replace('\\', '/');
            PlanningNode node = new PlanningNode(
                relativePath,
                fm.getOrDefault("type", null),
                coalesce(fm.get("title"), fm.get("name")),
                fm.getOrDefault("status", null),
                fm.getOrDefault("source", null)
            );

            String baseName = mdFile.getFileName().toString().replaceAll("\\.md$", "");
            Path subDir = dir.resolve(baseName);
            if (Files.isDirectory(subDir)) {
                node.getChildren().addAll(buildPlanningChildren(subDir, root, ownChildOrder));
            }
            nodes.add(node);
        }
        return nodes;
    }

    // ── Planning move ─────────────────────────────────────────────────────────

    /**
     * Moves a planning metafile (and its optional child folder) to a new parent directory.
     * Updates child_order in the old and new parent metafiles if they exist.
     *
     * @param fromPath     relative path of the source .md file (e.g. ".planning/buch/kap-01/szene-02.md")
     * @param toParentPath relative path of the target parent directory (e.g. ".planning/buch/kap-02")
     * @return new relative path of the moved .md file
     */
    public String movePlanningNode(String fromPath, String toParentPath) throws IOException {
        if (fromPath == null || toParentPath == null) throw new IOException("from and toParent are required");
        String normFrom = fromPath.replace('\\', '/');
        String normToParent = toParentPath.replace('\\', '/').replaceAll("/$", "");
        if (!normFrom.startsWith(PLANNING_DIR + "/") || !normToParent.startsWith(PLANNING_DIR)) {
            throw new IOException("Paths must be within .planning/");
        }
        if (normFrom.contains("..") || normToParent.contains("..")) {
            throw new IOException("Path traversal not allowed");
        }

        Path root = getProjectRoot();
        Path srcFile = root.resolve(normFrom).normalize();
        if (!srcFile.startsWith(root) || !Files.isRegularFile(srcFile)) {
            throw new IOException("Source file not found: " + normFrom);
        }

        Path targetDir = root.resolve(normToParent).normalize();
        if (!targetDir.startsWith(root) || !Files.isDirectory(targetDir)) {
            throw new IOException("Target directory not found: " + normToParent);
        }

        String fileName = srcFile.getFileName().toString();
        Path dstFile = targetDir.resolve(fileName).normalize();
        if (!dstFile.startsWith(root)) throw new IOException("Access denied");
        if (Files.exists(dstFile)) throw new IOException("File already exists at target: " + root.relativize(dstFile));

        // Move the .md file
        Files.move(srcFile, dstFile);

        // Move the associated child folder if present
        String baseName = fileName.replaceAll("\\.md$", "");
        Path srcFolder = srcFile.getParent().resolve(baseName).normalize();
        if (Files.isDirectory(srcFolder)) {
            Path dstFolder = targetDir.resolve(baseName).normalize();
            if (!dstFolder.startsWith(root)) throw new IOException("Access denied");
            Files.move(srcFolder, dstFolder);
        }

        String newRelPath = root.relativize(dstFile).toString().replace('\\', '/');

        // Update child_order in old parent metafile
        Path oldParentMetafile = resolveParentMetafile(srcFile.getParent(), root);
        if (oldParentMetafile != null && Files.exists(oldParentMetafile)) {
            removeFromChildOrder(oldParentMetafile, fileName);
        }

        // Update child_order in new parent metafile
        Path newParentMetafile = resolveParentMetafile(targetDir, root);
        if (newParentMetafile != null && Files.exists(newParentMetafile)) {
            appendToChildOrder(newParentMetafile, fileName);
        }

        return newRelPath;
    }

    /** Given a directory inside .planning/, returns the .md file that "owns" it (one level up). */
    private Path resolveParentMetafile(Path dir, Path root) {
        Path planningDir = root.resolve(PLANNING_DIR);
        if (dir.equals(planningDir)) return null; // root of planning has no parent metafile
        Path parentDir = dir.getParent();
        if (parentDir == null) return null;
        String dirName = dir.getFileName().toString();
        Path candidate = parentDir.resolve(dirName + ".md").normalize();
        return candidate.startsWith(root) ? candidate : null;
    }

    /** Updates child_order in a frontmatter file: removes the given filename entry. */
    private void removeFromChildOrder(Path metafile, String filename) throws IOException {
        String content = Files.readString(metafile, StandardCharsets.UTF_8);
        List<String> order = parseChildOrder(content);
        order.removeIf(e -> e.equalsIgnoreCase(filename));
        Files.writeString(metafile, writeChildOrder(content, order), StandardCharsets.UTF_8);
    }

    /** Updates child_order in a frontmatter file: appends the given filename entry. */
    private void appendToChildOrder(Path metafile, String filename) throws IOException {
        String content = Files.readString(metafile, StandardCharsets.UTF_8);
        List<String> order = parseChildOrder(content);
        if (!order.contains(filename)) order.add(filename);
        Files.writeString(metafile, writeChildOrder(content, order), StandardCharsets.UTF_8);
    }

    // ── Frontmatter helpers ───────────────────────────────────────────────────

    private Map<String, String> parseFrontmatter(String content) {
        if (!content.startsWith("---")) return Collections.emptyMap();
        int end = content.indexOf("\n---", 3);
        if (end == -1) return Collections.emptyMap();
        String fmBlock = content.substring(4, end);
        Map<String, String> result = new LinkedHashMap<>();
        Matcher m = FM_KEY.matcher(fmBlock);
        while (m.find()) {
            result.put(m.group(1).trim(), m.group(2).trim());
        }
        return result;
    }

    /** Parses a YAML list value for the 'child_order' key from raw file content. */
    private List<String> parseChildOrder(String content) {
        if (content == null || !content.startsWith("---")) return new ArrayList<>();
        int fmEnd = content.indexOf("\n---", 3);
        String fm = fmEnd > 0 ? content.substring(0, fmEnd) : content;

        int keyIdx = fm.indexOf("\nchild_order:");
        if (keyIdx == -1) return new ArrayList<>();

        List<String> result = new ArrayList<>();
        int pos = fm.indexOf('\n', keyIdx + 1); // end of "child_order:" line
        if (pos == -1) return result;

        Pattern listItem = Pattern.compile("^[ \\t]+-[ \\t]+(.+)$");
        String[] lines = fm.substring(pos + 1).split("\n");
        for (String line : lines) {
            Matcher m = listItem.matcher(line);
            if (m.matches()) {
                result.add(m.group(1).trim());
            } else if (!line.isBlank()) {
                break; // end of the list block
            }
        }
        return result;
    }

    /**
     * Returns a new file content string where the child_order YAML block is replaced
     * (or added before the closing ---) with the given list.
     */
    private String writeChildOrder(String content, List<String> order) {
        if (!content.startsWith("---")) return content;
        int fmEnd = content.indexOf("\n---", 3);
        if (fmEnd == -1) return content;

        String fmSection = content.substring(0, fmEnd);
        String rest = content.substring(fmEnd); // starts with "\n---"

        // Remove existing child_order block
        int keyIdx = fmSection.indexOf("\nchild_order:");
        if (keyIdx != -1) {
            // Find where the block ends (next non-list, non-blank line after the key)
            int blockEnd = fmSection.indexOf('\n', keyIdx + 1);
            if (blockEnd == -1) blockEnd = fmSection.length();
            else {
                Pattern listLine = Pattern.compile("^[ \\t]+-[ \\t]+.+$|^[ \\t]*$");
                String[] afterKey = fmSection.substring(blockEnd + 1).split("\n");
                int offset = blockEnd + 1;
                for (String line : afterKey) {
                    if (listLine.matcher(line).matches()) {
                        offset += line.length() + 1;
                    } else {
                        break;
                    }
                }
                blockEnd = offset - 1;
            }
            fmSection = fmSection.substring(0, keyIdx) + fmSection.substring(blockEnd);
        }

        // Build new child_order block
        StringBuilder sb = new StringBuilder();
        sb.append("\nchild_order:");
        if (order.isEmpty()) {
            sb.append(" []");
        } else {
            for (String item : order) {
                sb.append("\n  - ").append(item);
            }
        }
        fmSection = fmSection + sb;

        return fmSection + rest;
    }

    private static String coalesce(String... values) {
        for (String v : values) { if (v != null && !v.isBlank()) return v; }
        return null;
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
