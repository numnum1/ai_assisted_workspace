package com.assistant.service;

import com.assistant.model.*;
import com.assistant.util.NaturalTitleComparator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.stream.Stream;

@Service
public class ChapterService {

    private static final String CHAPTERS_DIR = ".project/chapter";
    private static final int MAX_STRUCTURE_SEARCH_HITS = 40;

    private final FileService fileService;
    private final ObjectMapper objectMapper;

    public ChapterService(FileService fileService, ObjectMapper objectMapper) {
        this.fileService = fileService;
        this.objectMapper = objectMapper;
    }

    // ─── Path helpers ─────────────────────────────────────────────────────────

    private Path chaptersRoot() {
        return fileService.getProjectRoot().resolve(CHAPTERS_DIR);
    }

    private Path chapterDir(String chapterId) {
        return chaptersRoot().resolve(chapterId);
    }

    private Path chapterMeta(String chapterId) {
        return chaptersRoot().resolve(chapterId + ".json");
    }

    private Path sceneDir(String chapterId, String sceneId) {
        return chapterDir(chapterId).resolve(sceneId);
    }

    private Path sceneMeta(String chapterId, String sceneId) {
        return chapterDir(chapterId).resolve(sceneId + ".json");
    }

    private Path actionMeta(String chapterId, String sceneId, String actionId) {
        return sceneDir(chapterId, sceneId).resolve(actionId + ".json");
    }

    private Path actionContent(String chapterId, String sceneId, String actionId) {
        return sceneDir(chapterId, sceneId).resolve(actionId + ".md");
    }

    // ─── Read structure ────────────────────────────────────────────────────────

    public List<ChapterSummary> listChapters() throws IOException {
        Path root = chaptersRoot();
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<ChapterSummary> chapters = new ArrayList<>();
        try (Stream<Path> entries = Files.list(root)) {
            entries
                .filter(p -> p.getFileName().toString().endsWith(".json"))
                .forEach(p -> {
                    String id = stripExtension(p.getFileName().toString());
                    try {
                        StructureNodeMeta meta = readMeta(p);
                        chapters.add(new ChapterSummary(id, meta));
                    } catch (IOException e) {
                        chapters.add(new ChapterSummary(id, new StructureNodeMeta(id, "", 0)));
                    }
                });
        }
        chapters.sort((c1, c2) -> {
            int byKey = NaturalTitleComparator.INSTANCE.compare(
                    NaturalTitleComparator.chapterSortKey(c1),
                    NaturalTitleComparator.chapterSortKey(c2));
            if (byKey != 0) {
                return byKey;
            }
            String id1 = c1.getId() != null ? c1.getId() : "";
            String id2 = c2.getId() != null ? c2.getId() : "";
            return NaturalTitleComparator.INSTANCE.compare(id1, id2);
        });
        return chapters;
    }

    public ChapterNode getChapter(String chapterId) throws IOException {
        Path metaPath = chapterMeta(chapterId);
        if (!Files.exists(metaPath)) {
            throw new NoSuchFileException("Chapter not found: " + chapterId);
        }
        StructureNodeMeta chapterMeta = readMeta(metaPath);
        ChapterNode chapter = new ChapterNode(chapterId, chapterMeta);

        Path cDir = chapterDir(chapterId);
        if (Files.isDirectory(cDir)) {
            try (Stream<Path> entries = Files.list(cDir)) {
                entries
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .forEach(p -> {
                        String sceneId = stripExtension(p.getFileName().toString());
                        try {
                            StructureNodeMeta sMeta = readMeta(p);
                            SceneNode scene = new SceneNode(sceneId, sMeta);
                            Path sDir = sceneDir(chapterId, sceneId);
                            if (Files.isDirectory(sDir)) {
                                try (Stream<Path> sEntries = Files.list(sDir)) {
                                    sEntries
                                        .filter(ap -> ap.getFileName().toString().endsWith(".json"))
                                        .forEach(ap -> {
                                            String actionId = stripExtension(ap.getFileName().toString());
                                            try {
                                                StructureNodeMeta aMeta = readMeta(ap);
                                                scene.getActions().add(new ActionNode(actionId, aMeta));
                                            } catch (IOException e) {
                                                scene.getActions().add(new ActionNode(actionId, new StructureNodeMeta(actionId, "", 0)));
                                            }
                                        });
                                }
                            }
                            scene.getActions().sort(Comparator.comparingInt(a -> a.getMeta().getSortOrder()));
                            chapter.getScenes().add(scene);
                        } catch (IOException e) {
                            chapter.getScenes().add(new SceneNode(sceneId, new StructureNodeMeta(sceneId, "", 0)));
                        }
                    });
            }
        }
        chapter.getScenes().sort(Comparator.comparingInt(s -> s.getMeta().getSortOrder()));
        return chapter;
    }

    /**
     * Compact tree of chapter / scene / action ids and human titles for AI context.
     */
    public String buildStoryStructureOverview() throws IOException {
        List<ChapterSummary> chapters = listChapters();
        if (chapters.isEmpty()) {
            return "(No story chapters yet.)\n";
        }
        StringBuilder sb = new StringBuilder();
        for (ChapterSummary summary : chapters) {
            String cid = summary.getId();
            sb.append(cid).append(": ").append(formatMetaTitle(summary.getMeta())).append('\n');
            ChapterNode full = getChapter(cid);
            for (SceneNode scene : full.getScenes()) {
                sb.append("  ").append(scene.getId()).append(": ")
                        .append(formatMetaTitle(scene.getMeta())).append('\n');
                for (ActionNode action : scene.getActions()) {
                    sb.append("    ").append(action.getId()).append(": ")
                            .append(formatMetaTitle(action.getMeta())).append('\n');
                }
            }
        }
        return sb.toString();
    }

    /**
     * Search chapters, scenes, and actions by title or description in meta JSON (not file names).
     * Returns ids, meta paths, and tool hints (read_story_text / read_file).
     */
    public String searchStoryStructure(String query) throws IOException {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder();
        int hits = 0;
        search:
        for (ChapterSummary summary : listChapters()) {
            String chapterId = summary.getId();
            ChapterNode chapter = getChapter(chapterId);
            if (hits < MAX_STRUCTURE_SEARCH_HITS && metaMatches(chapter.getMeta(), lower)) {
                appendChapterSearchLine(sb, chapterId, chapter.getMeta());
                hits++;
            }
            if (hits >= MAX_STRUCTURE_SEARCH_HITS) {
                break;
            }
            for (SceneNode scene : chapter.getScenes()) {
                if (hits < MAX_STRUCTURE_SEARCH_HITS && metaMatches(scene.getMeta(), lower)) {
                    appendSceneSearchLine(sb, chapterId, scene);
                    hits++;
                }
                if (hits >= MAX_STRUCTURE_SEARCH_HITS) {
                    break search;
                }
                for (ActionNode action : scene.getActions()) {
                    if (hits < MAX_STRUCTURE_SEARCH_HITS && metaMatches(action.getMeta(), lower)) {
                        appendActionSearchLine(sb, chapterId, scene.getId(), action);
                        hits++;
                    }
                    if (hits >= MAX_STRUCTURE_SEARCH_HITS) {
                        break search;
                    }
                }
            }
        }
        if (hits == 0) {
            return "No chapters, scenes, or actions matching '" + trimmed + "' in titles or descriptions.";
        }
        sb.insert(0, "Found " + hits + " matching node(s) (by title/description in meta JSON, not file names):\n");
        if (hits >= MAX_STRUCTURE_SEARCH_HITS) {
            sb.append("(Result limit reached; refine your query.)\n");
        }
        return sb.toString();
    }

    private static String formatMetaTitle(StructureNodeMeta meta) {
        if (meta == null) {
            return "(untitled)";
        }
        String t = meta.getTitle();
        if (t == null || t.isBlank()) {
            return "(untitled)";
        }
        return "\"" + t.replace("\"", "'") + "\"";
    }

    private static boolean metaMatches(StructureNodeMeta meta, String lowerQuery) {
        if (meta == null) {
            return false;
        }
        String title = meta.getTitle() != null ? meta.getTitle() : "";
        String desc = meta.getDescription() != null ? meta.getDescription() : "";
        return title.toLowerCase(Locale.ROOT).contains(lowerQuery)
                || desc.toLowerCase(Locale.ROOT).contains(lowerQuery);
    }

    private void appendChapterSearchLine(StringBuilder sb, String chapterId, StructureNodeMeta meta) {
        sb.append("- CHAPTER ").append(chapterId);
        sb.append(" — ").append(formatMetaTitle(meta));
        sb.append("\n  meta: ").append(CHAPTERS_DIR).append('/').append(chapterId).append(".json");
        sb.append("\n  read_story_text: chapter_id=\"").append(chapterId).append("\"\n\n");
    }

    private void appendSceneSearchLine(StringBuilder sb, String chapterId, SceneNode scene) {
        sb.append("- SCENE ").append(scene.getId()).append(" (chapter ").append(chapterId).append(")");
        sb.append(" — ").append(formatMetaTitle(scene.getMeta()));
        sb.append("\n  meta: ").append(CHAPTERS_DIR).append('/').append(chapterId).append('/')
                .append(scene.getId()).append(".json");
        sb.append("\n  read_story_text: chapter_id=\"").append(chapterId).append("\", scene_id=\"")
                .append(scene.getId()).append("\"\n\n");
    }

    private void appendActionSearchLine(StringBuilder sb, String chapterId, String sceneId, ActionNode action) {
        sb.append("- ACTION ").append(action.getId()).append(" (").append(chapterId).append('/')
                .append(sceneId).append(")");
        sb.append(" — ").append(formatMetaTitle(action.getMeta()));
        sb.append("\n  meta: ").append(CHAPTERS_DIR).append('/').append(chapterId).append('/')
                .append(sceneId).append('/').append(action.getId()).append(".json");
        sb.append("\n  prose: ").append(CHAPTERS_DIR).append('/').append(chapterId).append('/')
                .append(sceneId).append('/').append(action.getId()).append(".md");
        sb.append("\n  read_story_text: chapter_id=\"").append(chapterId).append("\", scene_id=\"")
                .append(sceneId).append("\" (scene-level prose; use read_file on .md for this beat only)\n\n");
    }

    // ─── Action content ────────────────────────────────────────────────────────

    public String readActionContent(String chapterId, String sceneId, String actionId) throws IOException {
        Path path = actionContent(chapterId, sceneId, actionId);
        if (!Files.exists(path)) return "";
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    public void writeActionContent(String chapterId, String sceneId, String actionId, String content) throws IOException {
        Path path = actionContent(chapterId, sceneId, actionId);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }

    // ─── Chapter CRUD ──────────────────────────────────────────────────────────

    public ChapterSummary createChapter(String title) throws IOException {
        Files.createDirectories(chaptersRoot());
        int nextOrder = nextSortOrder(chaptersRoot(), ".json");
        String id = generateId("chapter", chaptersRoot(), ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(chapterMeta(id), meta);
        Files.createDirectories(chapterDir(id));
        return new ChapterSummary(id, meta);
    }

    public void updateChapterMeta(String chapterId, StructureNodeMeta meta) throws IOException {
        writeMeta(chapterMeta(chapterId), meta);
    }

    public void deleteChapter(String chapterId) throws IOException {
        deleteIfExists(chapterMeta(chapterId));
        deleteRecursively(chapterDir(chapterId));
    }

    // ─── Scene CRUD ────────────────────────────────────────────────────────────

    public SceneNode createScene(String chapterId, String title) throws IOException {
        Path cDir = chapterDir(chapterId);
        Files.createDirectories(cDir);
        int nextOrder = nextSortOrder(cDir, ".json");
        String id = generateId("scene", cDir, ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(sceneMeta(chapterId, id), meta);
        Files.createDirectories(sceneDir(chapterId, id));
        SceneNode scene = new SceneNode(id, meta);
        ActionNode defaultAction = createAction(chapterId, id, "Inhalt");
        scene.getActions().add(defaultAction);
        return scene;
    }

    public void updateSceneMeta(String chapterId, String sceneId, StructureNodeMeta meta) throws IOException {
        writeMeta(sceneMeta(chapterId, sceneId), meta);
    }

    public void deleteScene(String chapterId, String sceneId) throws IOException {
        deleteIfExists(sceneMeta(chapterId, sceneId));
        deleteRecursively(sceneDir(chapterId, sceneId));
    }

    // ─── Action CRUD ───────────────────────────────────────────────────────────

    public ActionNode createAction(String chapterId, String sceneId, String title) throws IOException {
        Path sDir = sceneDir(chapterId, sceneId);
        Files.createDirectories(sDir);
        int nextOrder = nextSortOrder(sDir, ".json");
        String id = generateId("action", sDir, ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(actionMeta(chapterId, sceneId, id), meta);
        Files.writeString(actionContent(chapterId, sceneId, id), "", StandardCharsets.UTF_8);
        return new ActionNode(id, meta);
    }

    public void updateActionMeta(String chapterId, String sceneId, String actionId, StructureNodeMeta meta) throws IOException {
        writeMeta(actionMeta(chapterId, sceneId, actionId), meta);
    }

    public void deleteAction(String chapterId, String sceneId, String actionId) throws IOException {
        deleteIfExists(actionMeta(chapterId, sceneId, actionId));
        deleteIfExists(actionContent(chapterId, sceneId, actionId));
    }

    // ─── Reorder ──────────────────────────────────────────────────────────────

    public void reorderScenes(String chapterId, List<String> orderedIds) throws IOException {
        for (int i = 0; i < orderedIds.size(); i++) {
            String sceneId = orderedIds.get(i);
            Path metaPath = sceneMeta(chapterId, sceneId);
            if (Files.exists(metaPath)) {
                StructureNodeMeta meta = readMeta(metaPath);
                meta.setSortOrder(i);
                writeMeta(metaPath, meta);
            }
        }
    }

    public void reorderActions(String chapterId, String sceneId, List<String> orderedIds) throws IOException {
        for (int i = 0; i < orderedIds.size(); i++) {
            String actionId = orderedIds.get(i);
            Path metaPath = actionMeta(chapterId, sceneId, actionId);
            if (Files.exists(metaPath)) {
                StructureNodeMeta meta = readMeta(metaPath);
                meta.setSortOrder(i);
                writeMeta(metaPath, meta);
            }
        }
    }

    // ─── Book meta ────────────────────────────────────────────────────────────

    private Path bookMeta() {
        return fileService.getProjectRoot().resolve(".project/book.json");
    }

    public StructureNodeMeta getBookMeta() throws IOException {
        Path path = bookMeta();
        if (!Files.exists(path)) {
            return new StructureNodeMeta();
        }
        return readMeta(path);
    }

    public void updateBookMeta(StructureNodeMeta meta) throws IOException {
        writeMeta(bookMeta(), meta);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private StructureNodeMeta readMeta(Path path) throws IOException {
        String json = Files.readString(path, StandardCharsets.UTF_8);
        return objectMapper.readValue(json, StructureNodeMeta.class);
    }

    private void writeMeta(Path path, StructureNodeMeta meta) throws IOException {
        Files.createDirectories(path.getParent());
        Files.writeString(path, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(meta), StandardCharsets.UTF_8);
    }

    private String stripExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(0, dot) : filename;
    }

    private int nextSortOrder(Path dir, String extension) throws IOException {
        if (!Files.isDirectory(dir)) return 0;
        try (Stream<Path> entries = Files.list(dir)) {
            return (int) entries.filter(p -> p.getFileName().toString().endsWith(extension)).count();
        }
    }

    private String generateId(String prefix, Path dir, String extension) throws IOException {
        int counter = 1;
        while (Files.exists(dir.resolve(prefix + "_" + counter + extension))) {
            counter++;
        }
        return prefix + "_" + counter;
    }

    private void deleteIfExists(Path path) throws IOException {
        if (Files.exists(path)) {
            Files.delete(path);
        }
    }

    private void deleteRecursively(Path path) throws IOException {
        if (!Files.exists(path)) return;
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
