package com.assistant.meta_files;

import com.assistant.file_services.FileService;
import com.assistant.project_outliner.StructureNodeMeta;
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

    // ─── Path helpers (workspaceRoot = null or blank → project root) ───────────

    private Path structureBase(String workspaceRoot) throws IOException {
        if (workspaceRoot == null || workspaceRoot.isBlank() || ".".equals(workspaceRoot)) {
            return fileService.resolveRelativeDirectory(null);
        }
        return fileService.resolveRelativeDirectory(workspaceRoot);
    }

    private Path chaptersRoot(String workspaceRoot) throws IOException {
        return structureBase(workspaceRoot).resolve(CHAPTERS_DIR);
    }

    private Path chapterDir(String workspaceRoot, String chapterId) throws IOException {
        return chaptersRoot(workspaceRoot).resolve(chapterId);
    }

    private Path chapterMeta(String workspaceRoot, String chapterId) throws IOException {
        return chaptersRoot(workspaceRoot).resolve(chapterId + ".json");
    }

    private Path sceneDir(String workspaceRoot, String chapterId, String sceneId) throws IOException {
        return chapterDir(workspaceRoot, chapterId).resolve(sceneId);
    }

    private Path sceneMeta(String workspaceRoot, String chapterId, String sceneId) throws IOException {
        return chapterDir(workspaceRoot, chapterId).resolve(sceneId + ".json");
    }

    private Path actionMeta(String workspaceRoot, String chapterId, String sceneId, String actionId) throws IOException {
        return sceneDir(workspaceRoot, chapterId, sceneId).resolve(actionId + ".json");
    }

    private Path actionContent(String workspaceRoot, String chapterId, String sceneId, String actionId) throws IOException {
        return sceneDir(workspaceRoot, chapterId, sceneId).resolve(actionId + ".md");
    }

    private Path bookMeta(String workspaceRoot) throws IOException {
        return structureBase(workspaceRoot).resolve(".project/book.json");
    }

    // ─── Read structure ────────────────────────────────────────────────────────

    public List<ChapterSummary> listChapters() throws IOException {
        return listChapters(null);
    }

    public List<ChapterSummary> listChapters(String workspaceRoot) throws IOException {
        Path root = chaptersRoot(workspaceRoot);
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
        return getChapter(null, chapterId);
    }

    public ChapterNode getChapter(String workspaceRoot, String chapterId) throws IOException {
        Path metaPath = chapterMeta(workspaceRoot, chapterId);
        if (!Files.exists(metaPath)) {
            throw new NoSuchFileException("Chapter not found: " + chapterId);
        }
        StructureNodeMeta chapterMeta = readMeta(metaPath);
        ChapterNode chapter = new ChapterNode(chapterId, chapterMeta);

        Path cDir = chapterDir(workspaceRoot, chapterId);
        if (Files.isDirectory(cDir)) {
            try (Stream<Path> entries = Files.list(cDir)) {
                entries
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .forEach(p -> {
                        String sceneId = stripExtension(p.getFileName().toString());
                        try {
                            StructureNodeMeta sMeta = readMeta(p);
                            SceneNode scene = new SceneNode(sceneId, sMeta);
                            Path sDir = sceneDir(workspaceRoot, chapterId, sceneId);
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
        return readActionContent(null, chapterId, sceneId, actionId);
    }

    public String readActionContent(String workspaceRoot, String chapterId, String sceneId, String actionId) throws IOException {
        Path path = actionContent(workspaceRoot, chapterId, sceneId, actionId);
        if (!Files.exists(path)) return "";
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    public void writeActionContent(String chapterId, String sceneId, String actionId, String content) throws IOException {
        writeActionContent(null, chapterId, sceneId, actionId, content);
    }

    public void writeActionContent(String workspaceRoot, String chapterId, String sceneId, String actionId, String content) throws IOException {
        Path path = actionContent(workspaceRoot, chapterId, sceneId, actionId);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }

    // ─── Chapter CRUD ──────────────────────────────────────────────────────────

    public ChapterSummary createChapter(String title) throws IOException {
        return createChapter(null, title);
    }

    public ChapterSummary createChapter(String workspaceRoot, String title) throws IOException {
        Path cr = chaptersRoot(workspaceRoot);
        Files.createDirectories(cr);
        int nextOrder = nextSortOrder(cr, ".json");
        String id = generateId("chapter", cr, ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(chapterMeta(workspaceRoot, id), meta);
        Files.createDirectories(chapterDir(workspaceRoot, id));
        return new ChapterSummary(id, meta);
    }

    public void updateChapterMeta(String chapterId, StructureNodeMeta meta) throws IOException {
        updateChapterMeta(null, chapterId, meta);
    }

    public void updateChapterMeta(String workspaceRoot, String chapterId, StructureNodeMeta meta) throws IOException {
        writeMeta(chapterMeta(workspaceRoot, chapterId), meta);
    }

    public void deleteChapter(String chapterId) throws IOException {
        deleteChapter(null, chapterId);
    }

    public void deleteChapter(String workspaceRoot, String chapterId) throws IOException {
        deleteIfExists(chapterMeta(workspaceRoot, chapterId));
        deleteRecursively(chapterDir(workspaceRoot, chapterId));
    }

    // ─── Scene CRUD ────────────────────────────────────────────────────────────

    public SceneNode createScene(String chapterId, String title) throws IOException {
        return createScene(null, chapterId, title);
    }

    public SceneNode createScene(String workspaceRoot, String chapterId, String title) throws IOException {
        Path cDir = chapterDir(workspaceRoot, chapterId);
        Files.createDirectories(cDir);
        int nextOrder = nextSortOrder(cDir, ".json");
        String id = generateId("scene", cDir, ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(sceneMeta(workspaceRoot, chapterId, id), meta);
        Files.createDirectories(sceneDir(workspaceRoot, chapterId, id));
        SceneNode scene = new SceneNode(id, meta);
        ActionNode defaultAction = createAction(workspaceRoot, chapterId, id, "Inhalt");
        scene.getActions().add(defaultAction);
        return scene;
    }

    public void updateSceneMeta(String chapterId, String sceneId, StructureNodeMeta meta) throws IOException {
        updateSceneMeta(null, chapterId, sceneId, meta);
    }

    public void updateSceneMeta(String workspaceRoot, String chapterId, String sceneId, StructureNodeMeta meta) throws IOException {
        writeMeta(sceneMeta(workspaceRoot, chapterId, sceneId), meta);
    }

    public void deleteScene(String chapterId, String sceneId) throws IOException {
        deleteScene(null, chapterId, sceneId);
    }

    public void deleteScene(String workspaceRoot, String chapterId, String sceneId) throws IOException {
        deleteIfExists(sceneMeta(workspaceRoot, chapterId, sceneId));
        deleteRecursively(sceneDir(workspaceRoot, chapterId, sceneId));
    }

    // ─── Action CRUD ───────────────────────────────────────────────────────────

    public ActionNode createAction(String chapterId, String sceneId, String title) throws IOException {
        return createAction(null, chapterId, sceneId, title);
    }

    public ActionNode createAction(String workspaceRoot, String chapterId, String sceneId, String title) throws IOException {
        Path sDir = sceneDir(workspaceRoot, chapterId, sceneId);
        Files.createDirectories(sDir);
        int nextOrder = nextSortOrder(sDir, ".json");
        String id = generateId("action", sDir, ".json");
        StructureNodeMeta meta = new StructureNodeMeta(title, "", nextOrder);
        writeMeta(actionMeta(workspaceRoot, chapterId, sceneId, id), meta);
        Files.writeString(actionContent(workspaceRoot, chapterId, sceneId, id), "", StandardCharsets.UTF_8);
        return new ActionNode(id, meta);
    }

    public void updateActionMeta(String chapterId, String sceneId, String actionId, StructureNodeMeta meta) throws IOException {
        updateActionMeta(null, chapterId, sceneId, actionId, meta);
    }

    public void updateActionMeta(String workspaceRoot, String chapterId, String sceneId, String actionId, StructureNodeMeta meta) throws IOException {
        writeMeta(actionMeta(workspaceRoot, chapterId, sceneId, actionId), meta);
    }

    public void deleteAction(String chapterId, String sceneId, String actionId) throws IOException {
        deleteAction(null, chapterId, sceneId, actionId);
    }

    public void deleteAction(String workspaceRoot, String chapterId, String sceneId, String actionId) throws IOException {
        deleteIfExists(actionMeta(workspaceRoot, chapterId, sceneId, actionId));
        deleteIfExists(actionContent(workspaceRoot, chapterId, sceneId, actionId));
    }

    // ─── Reorder ──────────────────────────────────────────────────────────────

    public void reorderScenes(String chapterId, List<String> orderedIds) throws IOException {
        reorderScenes(null, chapterId, orderedIds);
    }

    public void reorderScenes(String workspaceRoot, String chapterId, List<String> orderedIds) throws IOException {
        for (int i = 0; i < orderedIds.size(); i++) {
            String sceneId = orderedIds.get(i);
            Path metaPath = sceneMeta(workspaceRoot, chapterId, sceneId);
            if (Files.exists(metaPath)) {
                StructureNodeMeta meta = readMeta(metaPath);
                meta.setSortOrder(i);
                writeMeta(metaPath, meta);
            }
        }
    }

    public void reorderActions(String chapterId, String sceneId, List<String> orderedIds) throws IOException {
        reorderActions(null, chapterId, sceneId, orderedIds);
    }

    public void reorderActions(String workspaceRoot, String chapterId, String sceneId, List<String> orderedIds) throws IOException {
        for (int i = 0; i < orderedIds.size(); i++) {
            String actionId = orderedIds.get(i);
            Path metaPath = actionMeta(workspaceRoot, chapterId, sceneId, actionId);
            if (Files.exists(metaPath)) {
                StructureNodeMeta meta = readMeta(metaPath);
                meta.setSortOrder(i);
                writeMeta(metaPath, meta);
            }
        }
    }

    // ─── Book meta ────────────────────────────────────────────────────────────

    public StructureNodeMeta getBookMeta() throws IOException {
        return getBookMeta(null);
    }

    public StructureNodeMeta getBookMeta(String workspaceRoot) throws IOException {
        Path path = bookMeta(workspaceRoot);
        if (!Files.exists(path)) {
            return new StructureNodeMeta();
        }
        return readMeta(path);
    }

    public void updateBookMeta(StructureNodeMeta meta) throws IOException {
        updateBookMeta(null, meta);
    }

    public void updateBookMeta(String workspaceRoot, StructureNodeMeta meta) throws IOException {
        writeMeta(bookMeta(workspaceRoot), meta);
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

    private String generateId(String prefix, Path dir, String extension) {
        return UUID.randomUUID().toString();
    }

    public int randomizeIds(String workspaceRoot) throws IOException {
        Path cr = chaptersRoot(workspaceRoot);
        if (!Files.isDirectory(cr)) return 0;
        int count = 0;
        List<Path> chapterJsons = new ArrayList<>();
        try (Stream<Path> entries = Files.list(cr)) {
            entries.filter(p -> {
                String n = p.getFileName().toString();
                return n.endsWith(".json") && n.matches("chapter_\\d+\\.json");
            }).forEach(chapterJsons::add);
        }
        for (Path cJson : chapterJsons) {
            String oldCid = stripExtension(cJson.getFileName().toString());
            String newCid = UUID.randomUUID().toString();
            Path oldCdir = cr.resolve(oldCid);
            Path newCdir = cr.resolve(newCid);
            if (oldCdir.isAbsolute() && Files.isDirectory(oldCdir)) {
                List<Path> sceneJsons = new ArrayList<>();
                try (Stream<Path> entries = Files.list(oldCdir)) {
                    entries.filter(p -> {
                        String n = p.getFileName().toString();
                        return n.endsWith(".json") && n.matches("scene_\\d+\\.json");
                    }).forEach(sceneJsons::add);
                }
                for (Path sJson : sceneJsons) {
                    String oldSid = stripExtension(sJson.getFileName().toString());
                    String newSid = UUID.randomUUID().toString();
                    Path oldSdir = oldCdir.resolve(oldSid);
                    Path newSdir = oldCdir.resolve(newSid);
                    if (Files.isDirectory(oldSdir)) {
                        List<Path> actionJsons = new ArrayList<>();
                        try (Stream<Path> entries = Files.list(oldSdir)) {
                            entries.filter(p -> {
                                String n = p.getFileName().toString();
                                return n.endsWith(".json") && n.matches("action_\\d+\\.json");
                            }).forEach(actionJsons::add);
                        }
                        for (Path aJson : actionJsons) {
                            String oldAid = stripExtension(aJson.getFileName().toString());
                            String newAid = UUID.randomUUID().toString();
                            Files.move(aJson, oldSdir.resolve(newAid + ".json"));
                            Path aMd = oldSdir.resolve(oldAid + ".md");
                            if (Files.exists(aMd)) {
                                Files.move(aMd, oldSdir.resolve(newAid + ".md"));
                            }
                            count++;
                        }
                        Files.move(oldSdir, newSdir);
                    }
                    Files.move(sJson, oldCdir.resolve(newSid + ".json"));
                    count++;
                }
                Files.move(oldCdir, newCdir);
            }
            Files.move(cJson, cr.resolve(newCid + ".json"));
            count++;
        }
        return count;
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
