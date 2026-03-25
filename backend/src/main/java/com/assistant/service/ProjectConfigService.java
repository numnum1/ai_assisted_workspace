package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.Mode;
import com.assistant.model.ProjectConfig;
import com.assistant.model.WorkspaceModeInfo;
import com.assistant.model.WorkspaceModeSchema;
import com.assistant.model.WorkspaceModeSchema.MetaFieldPayload;
import com.assistant.model.WorkspaceModeSchema.MetaTypeSchemaPayload;
import com.assistant.model.WorkspaceModeSchema.WorkspaceLevelConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

@Service
public class ProjectConfigService {

    private static final Logger log = LoggerFactory.getLogger(ProjectConfigService.class);
    private static final String ASSISTANT_DIR = ".assistant";
    private static final String PROJECT_YAML = "project.yaml";
    private static final String MODES_DIR = "modes";
    private static final String RULES_DIR = "rules";
    private static final String WORKSPACE_MODES_PREFIX = "workspace-modes/";
    /** User plugin YAMLs: {@code <appData>/workspace-modes/*.yaml} */
    private static final String USER_WORKSPACE_MODES_DIR = "workspace-modes";

    private final AppConfig appConfig;

    public ProjectConfigService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    // ─── Path helpers ────────────────────────────────────────────────────────────

    private Path getAssistantDir() {
        String projectPath = appConfig.getProject().getPath();
        if (projectPath == null || projectPath.isBlank()) {
            throw new IllegalStateException("No project is open");
        }
        return Path.of(projectPath).resolve(ASSISTANT_DIR);
    }

    public boolean hasProjectConfig() {
        try {
            String projectPath = appConfig.getProject().getPath();
            if (projectPath == null || projectPath.isBlank()) return false;
            Path assistantDir = Path.of(projectPath).resolve(ASSISTANT_DIR);
            return Files.isDirectory(assistantDir) && Files.exists(assistantDir.resolve(PROJECT_YAML));
        } catch (Exception e) {
            return false;
        }
    }

    // ─── project.yaml ────────────────────────────────────────────────────────────

    public ProjectConfig getConfig() {
        if (!hasProjectConfig()) {
            return new ProjectConfig();
        }
        Path configFile = getAssistantDir().resolve(PROJECT_YAML);
        try {
            String yaml = Files.readString(configFile, StandardCharsets.UTF_8);
            return parseProjectConfig(yaml);
        } catch (IOException e) {
            log.warn("Could not read .assistant/project.yaml: {}", e.getMessage());
            return new ProjectConfig();
        }
    }

    public void saveConfig(ProjectConfig config) throws IOException {
        Path configFile = getAssistantDir().resolve(PROJECT_YAML);
        Files.createDirectories(configFile.getParent());
        Files.writeString(configFile, serializeProjectConfig(config), StandardCharsets.UTF_8);
    }

    // ─── Modes ───────────────────────────────────────────────────────────────────

    public List<Mode> getProjectModes() {
        if (!hasProjectConfig()) return List.of();
        Path modesDir = getAssistantDir().resolve(MODES_DIR);
        if (!Files.isDirectory(modesDir)) return List.of();

        List<Mode> modes = new ArrayList<>();
        Yaml yaml = new Yaml();
        try (Stream<Path> entries = Files.list(modesDir)) {
            entries
                .filter(p -> p.getFileName().toString().endsWith(".yaml"))
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .forEach(p -> {
                    try {
                        Mode mode = loadModeFromFile(p, yaml);
                        modes.add(mode);
                    } catch (IOException e) {
                        log.warn("Could not load mode from {}: {}", p, e.getMessage());
                    }
                });
        } catch (IOException e) {
            log.warn("Could not list modes directory: {}", e.getMessage());
        }
        return modes;
    }

    public void saveMode(Mode mode) throws IOException {
        Path modesDir = getAssistantDir().resolve(MODES_DIR);
        Files.createDirectories(modesDir);
        Path modeFile = modesDir.resolve(mode.getId() + ".yaml");
        Files.writeString(modeFile, serializeMode(mode), StandardCharsets.UTF_8);
    }

    public boolean deleteMode(String id) throws IOException {
        Path modeFile = getAssistantDir().resolve(MODES_DIR).resolve(id + ".yaml");
        if (!Files.exists(modeFile)) return false;
        Files.delete(modeFile);
        return true;
    }

    // ─── Rules ───────────────────────────────────────────────────────────────────

    public List<String> getRuleNames() {
        if (!hasProjectConfig()) return List.of();
        Path rulesDir = getAssistantDir().resolve(RULES_DIR);
        if (!Files.isDirectory(rulesDir)) return List.of();
        try (Stream<Path> entries = Files.list(rulesDir)) {
            return entries
                .filter(p -> p.getFileName().toString().endsWith(".md"))
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .map(p -> RULES_DIR + "/" + p.getFileName().toString())
                .toList();
        } catch (IOException e) {
            log.warn("Could not list rules directory: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Reads the given rule paths (relative to .assistant/) and returns their content.
     * Each entry in the returned map: path -> content.
     */
    public Map<String, String> getRuleContents(List<String> rulePaths) {
        if (rulePaths == null || rulePaths.isEmpty()) return Map.of();
        Path assistantDir = getAssistantDir();
        Map<String, String> result = new LinkedHashMap<>();
        for (String rulePath : rulePaths) {
            Path file = assistantDir.resolve(rulePath).normalize();
            if (!file.startsWith(assistantDir)) {
                log.warn("Rule path escapes .assistant/ directory: {}", rulePath);
                continue;
            }
            if (!Files.exists(file)) {
                log.debug("Rule file not found: {}", rulePath);
                continue;
            }
            try {
                result.put(rulePath, Files.readString(file, StandardCharsets.UTF_8));
            } catch (IOException e) {
                log.warn("Could not read rule {}: {}", rulePath, e.getMessage());
            }
        }
        return result;
    }

    public void saveRule(String name, String content) throws IOException {
        Path rulesDir = getAssistantDir().resolve(RULES_DIR);
        Files.createDirectories(rulesDir);
        String filename = name.endsWith(".md") ? name : name + ".md";
        Path ruleFile = rulesDir.resolve(filename);
        if (!ruleFile.startsWith(rulesDir)) {
            throw new IOException("Invalid rule name: " + name);
        }
        Files.writeString(ruleFile, content, StandardCharsets.UTF_8);
    }

    public boolean deleteRule(String name) throws IOException {
        String filename = name.endsWith(".md") ? name : name + ".md";
        Path ruleFile = getAssistantDir().resolve(RULES_DIR).resolve(filename);
        if (!Files.exists(ruleFile)) return false;
        Files.delete(ruleFile);
        return true;
    }

    // ─── Init ────────────────────────────────────────────────────────────────────

    /**
     * Initializes the .assistant/ folder for the current project.
     * Creates project.yaml and copies built-in modes.
     * If already initialized, returns the existing config without overwriting.
     */
    public ProjectConfig initProjectConfig() throws IOException {
        Path assistantDir = getAssistantDir();
        Path configFile = assistantDir.resolve(PROJECT_YAML);

        if (Files.exists(configFile)) {
            return getConfig();
        }

        Files.createDirectories(assistantDir.resolve(MODES_DIR));
        Files.createDirectories(assistantDir.resolve(RULES_DIR));

        ProjectConfig config = new ProjectConfig();
        String projectPath = appConfig.getProject().getPath();
        config.setName(Path.of(projectPath).getFileName().toString());
        config.setDefaultMode("review");
        config.setWorkspaceMode("default");

        // Copy built-in modes as a starting point
        copyBuiltinModesToProject(assistantDir.resolve(MODES_DIR));

        saveConfig(config);
        log.info("Initialized .assistant/ in {}", projectPath);
        return config;
    }

    private void copyBuiltinModesToProject(Path targetModesDir) {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Yaml yaml = new Yaml();
        try {
            Resource[] resources = resolver.getResources("classpath:modes/*.yaml");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename == null) continue;
                Path target = targetModesDir.resolve(filename);
                if (Files.exists(target)) continue;
                try (InputStream is = resource.getInputStream()) {
                    Files.copy(is, target);
                } catch (IOException e) {
                    log.warn("Could not copy built-in mode {}: {}", filename, e.getMessage());
                }
            }
        } catch (IOException e) {
            log.warn("Could not load built-in modes for copy: {}", e.getMessage());
        }
    }

    // ─── Parsing / Serialization ─────────────────────────────────────────────────

    private Mode loadModeFromFile(Path file, Yaml yaml) throws IOException {
        try (InputStream is = Files.newInputStream(file)) {
            Map<String, Object> data = yaml.load(is);
            Mode mode = new Mode();
            String filename = file.getFileName().toString();
            mode.setId(filename.replace(".yaml", ""));
            mode.setName((String) data.getOrDefault("name", mode.getId()));
            mode.setSystemPrompt((String) data.getOrDefault("systemPrompt", ""));
            mode.setColor((String) data.getOrDefault("color", "#89b4fa"));

            Object autoIncludes = data.get("autoIncludes");
            if (autoIncludes instanceof List<?> list) {
                mode.setAutoIncludes(list.stream().map(Object::toString).toList());
            }
            Object rules = data.get("rules");
            if (rules instanceof List<?> list) {
                mode.setRules(list.stream().map(Object::toString).toList());
            }
            return mode;
        }
    }

    @SuppressWarnings("unchecked")
    private ProjectConfig parseProjectConfig(String yamlStr) {
        Yaml yaml = new Yaml();
        Map<String, Object> data = yaml.load(yamlStr);
        if (data == null) return new ProjectConfig();

        ProjectConfig config = new ProjectConfig();
        config.setName((String) data.getOrDefault("name", ""));
        config.setDescription((String) data.getOrDefault("description", ""));

        Object alwaysInclude = data.get("alwaysInclude");
        if (alwaysInclude instanceof List<?> list) {
            config.setAlwaysInclude(list.stream().map(Object::toString).toList());
        }
        Object globalRules = data.get("globalRules");
        if (globalRules instanceof List<?> list) {
            config.setGlobalRules(list.stream().map(Object::toString).toList());
        }
        Object defaultMode = data.get("defaultMode");
        if (defaultMode != null) {
            config.setDefaultMode(defaultMode.toString());
        }
        Object workspaceMode = data.get("workspaceMode");
        if (workspaceMode != null) {
            config.setWorkspaceMode(workspaceMode.toString());
        }
        return config;
    }

    private String serializeProjectConfig(ProjectConfig config) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", config.getName() != null ? config.getName() : "");
        data.put("description", config.getDescription() != null ? config.getDescription() : "");
        data.put("alwaysInclude", config.getAlwaysInclude() != null ? config.getAlwaysInclude() : List.of());
        data.put("globalRules", config.getGlobalRules() != null ? config.getGlobalRules() : List.of());
        data.put("defaultMode", config.getDefaultMode() != null ? config.getDefaultMode() : "");
        data.put("workspaceMode", config.getWorkspaceMode() != null ? config.getWorkspaceMode() : "default");
        return buildYaml().dump(data);
    }

    // ─── Workspace mode schema (classpath YAML) ────────────────────────────────

    /**
     * Resolves the workspace mode for the current project and returns the full schema for the UI.
     */
    public WorkspaceModeSchema getWorkspaceModeSchema() {
        ProjectConfig cfg = getConfig();
        String modeId = cfg.getWorkspaceMode();
        if (modeId == null || modeId.isBlank()) {
            modeId = "default";
        }
        if (!isValidWorkspaceModeId(modeId)) {
            log.warn("Invalid workspaceMode in config: {}, falling back to default", modeId);
            modeId = "default";
        }
        return getWorkspaceModeSchemaById(modeId);
    }

    /**
     * Loads a workspace mode by id (classpath / user plugins), independent of {@link ProjectConfig#getWorkspaceMode()}.
     */
    public WorkspaceModeSchema getWorkspaceModeSchemaById(String modeId) {
        if (modeId == null || modeId.isBlank()) {
            modeId = "default";
        }
        if (!isValidWorkspaceModeId(modeId)) {
            log.warn("Invalid workspace mode id: {}, falling back to default", modeId);
            modeId = "default";
        }
        WorkspaceModeSchema schema = loadBuiltinWorkspaceModeYaml(modeId);
        if (schema == null && !"default".equals(modeId)) {
            schema = loadBuiltinWorkspaceModeYaml("default");
        }
        if (schema == null && !"book".equals(modeId)) {
            schema = loadBuiltinWorkspaceModeYaml("book");
        }
        return schema != null ? schema : new WorkspaceModeSchema();
    }

    private boolean isValidWorkspaceModeId(String id) {
        return id != null && id.matches("[a-zA-Z0-9_-]+");
    }

    /**
     * Loads workspace mode YAML: first {@code <appData>/workspace-modes/{id}.yaml}, then classpath.
     * Returns null if missing or invalid in both places.
     */
    public WorkspaceModeSchema loadBuiltinWorkspaceModeYaml(String modeId) {
        if (!isValidWorkspaceModeId(modeId)) {
            return null;
        }
        Path userFile = resolveAppDataDir().resolve(USER_WORKSPACE_MODES_DIR).resolve(modeId + ".yaml");
        if (Files.isRegularFile(userFile)) {
            Yaml yaml = new Yaml();
            try (InputStream is = Files.newInputStream(userFile)) {
                @SuppressWarnings("unchecked")
                Map<String, Object> data = yaml.load(is);
                if (data != null) {
                    return mapToWorkspaceModeSchema(data);
                }
            } catch (IOException e) {
                log.warn("Could not read user workspace mode {}: {}", modeId, e.getMessage());
            }
        }

        String path = WORKSPACE_MODES_PREFIX + modeId + ".yaml";
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            log.warn("Workspace mode resource not found: {}", path);
            return null;
        }
        Yaml yaml = new Yaml();
        try (InputStream is = resource.getInputStream()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = yaml.load(is);
            if (data == null) {
                return null;
            }
            return mapToWorkspaceModeSchema(data);
        } catch (IOException e) {
            log.warn("Could not read workspace mode {}: {}", modeId, e.getMessage());
            return null;
        }
    }

    /**
     * Built-in classpath modes plus user plugins from app data directory. User YAML overrides same {@code id}.
     */
    public List<WorkspaceModeInfo> listAvailableWorkspaceModes() {
        Map<String, WorkspaceModeInfo> byId = new LinkedHashMap<>();
        try {
            collectClasspathWorkspaceModeInfos(byId);
        } catch (IOException e) {
            log.warn("Could not scan classpath workspace-modes: {}", e.getMessage());
        }
        collectUserWorkspaceModeInfos(byId);
        List<WorkspaceModeInfo> list = new ArrayList<>(byId.values());
        list.sort(Comparator.comparing(WorkspaceModeInfo::name, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(WorkspaceModeInfo::id));
        return list;
    }

    /**
     * Directory for user workspace-mode YAML plugins: {@code <appData>/workspace-modes}.
     */
    public Path getUserWorkspaceModesDirectory() {
        return resolveAppDataDir().resolve(USER_WORKSPACE_MODES_DIR);
    }

    private Path resolveAppDataDir() {
        String configured = appConfig.getData().getDataDir();
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured);
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            String appdata = System.getenv("APPDATA");
            if (appdata != null && !appdata.isBlank()) {
                return Path.of(appdata, "markdown-project");
            }
            return Path.of(System.getProperty("user.home"), "AppData", "Roaming", "markdown-project");
        }
        return Path.of(System.getProperty("user.home"), ".config", "markdown-project");
    }

    private void collectClasspathWorkspaceModeInfos(Map<String, WorkspaceModeInfo> byId) throws IOException {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath:workspace-modes/*.yaml");
        Yaml yaml = new Yaml();
        for (Resource resource : resources) {
            String filename = resource.getFilename();
            if (filename == null || !filename.endsWith(".yaml")) {
                continue;
            }
            String stem = filename.substring(0, filename.length() - ".yaml".length());
            if (!isValidWorkspaceModeId(stem)) {
                continue;
            }
            try (InputStream is = resource.getInputStream()) {
                WorkspaceModeInfo info = readWorkspaceModeInfoFromYaml(yaml, is, stem, "builtin");
                byId.put(info.id(), info);
            } catch (IOException e) {
                log.warn("Could not read workspace mode resource {}: {}", filename, e.getMessage());
            }
        }
    }

    private void collectUserWorkspaceModeInfos(Map<String, WorkspaceModeInfo> byId) {
        Path dir = resolveAppDataDir().resolve(USER_WORKSPACE_MODES_DIR);
        if (!Files.isDirectory(dir)) {
            return;
        }
        Yaml yaml = new Yaml();
        try (Stream<Path> stream = Files.list(dir)) {
            stream.filter(p -> Files.isRegularFile(p) && p.getFileName().toString().endsWith(".yaml"))
                    .forEach(p -> {
                        String fn = p.getFileName().toString();
                        String stem = fn.substring(0, fn.length() - ".yaml".length());
                        if (!isValidWorkspaceModeId(stem)) {
                            return;
                        }
                        try (InputStream is = Files.newInputStream(p)) {
                            WorkspaceModeInfo info = readWorkspaceModeInfoFromYaml(yaml, is, stem, "user");
                            byId.put(info.id(), info);
                        } catch (IOException e) {
                            log.warn("Could not read user workspace mode {}: {}", p, e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.warn("Could not list user workspace modes dir {}: {}", dir, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private WorkspaceModeInfo readWorkspaceModeInfoFromYaml(Yaml yaml, InputStream is, String fallbackId, String source) {
        Map<String, Object> data;
        try {
            data = yaml.load(is);
        } catch (Exception e) {
            log.warn("Invalid workspace mode YAML ({}): {}", fallbackId, e.getMessage());
            return new WorkspaceModeInfo(fallbackId, fallbackId, source, "folder", false);
        }
        if (data == null) {
            return new WorkspaceModeInfo(fallbackId, fallbackId, source, "folder", false);
        }
        String id = stringVal(data.get("id"), fallbackId);
        if (!isValidWorkspaceModeId(id)) {
            id = fallbackId;
        }
        String name = stringVal(data.get("name"), id);
        String rootMetaIcon = stringVal(data.get("rootMetaIcon"), "folder");
        String icon = stringVal(data.get("icon"), rootMetaIcon);
        boolean mediaType = booleanVal(data.get("mediaType"), false);
        return new WorkspaceModeInfo(id, name, source, icon, mediaType);
    }

    @SuppressWarnings("unchecked")
    private WorkspaceModeSchema mapToWorkspaceModeSchema(Map<String, Object> data) {
        WorkspaceModeSchema schema = new WorkspaceModeSchema();
        schema.setId(stringVal(data.get("id"), "book"));
        schema.setName(stringVal(data.get("name"), ""));
        schema.setEditorMode(stringVal(data.get("editorMode"), "prose"));
        schema.setProseLeafLevel(stringVal(data.get("proseLeafLevel"), "action"));
        schema.setRootMetaLabel(stringVal(data.get("rootMetaLabel"), ""));
        schema.setRootMetaIcon(stringVal(data.get("rootMetaIcon"), "book"));
        schema.setIcon(stringVal(data.get("icon"), schema.getRootMetaIcon()));
        schema.setMediaType(booleanVal(data.get("mediaType"), false));

        Object levelsObj = data.get("levels");
        if (levelsObj instanceof List<?> list) {
            List<WorkspaceLevelConfig> levels = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    WorkspaceLevelConfig lvl = new WorkspaceLevelConfig();
                    lvl.setKey(stringVal(m.get("key"), ""));
                    lvl.setLabel(stringVal(m.get("label"), ""));
                    lvl.setLabelNew(stringVal(m.get("labelNew"), ""));
                    lvl.setIcon(stringVal(m.get("icon"), ""));
                    levels.add(lvl);
                }
            }
            schema.setLevels(levels);
        }

        Object metaObj = data.get("metaSchemas");
        if (metaObj instanceof Map<?, ?> metaMap) {
            Map<String, MetaTypeSchemaPayload> schemas = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : metaMap.entrySet()) {
                String key = e.getKey() != null ? e.getKey().toString() : "";
                if (e.getValue() instanceof Map<?, ?> schemaMap) {
                    schemas.put(key, mapToMetaTypeSchema(schemaMap));
                }
            }
            schema.setMetaSchemas(schemas);
        }
        return schema;
    }

    @SuppressWarnings("unchecked")
    private MetaTypeSchemaPayload mapToMetaTypeSchema(Map<?, ?> schemaMap) {
        MetaTypeSchemaPayload payload = new MetaTypeSchemaPayload();
        payload.setFilename(stringVal(schemaMap.get("filename"), ""));
        Object fieldsObj = schemaMap.get("fields");
        List<MetaFieldPayload> fields = new ArrayList<>();
        if (fieldsObj instanceof List<?> list) {
            for (Object f : list) {
                if (f instanceof Map<?, ?> fm) {
                    MetaFieldPayload field = new MetaFieldPayload();
                    field.setKey(stringVal(fm.get("key"), ""));
                    field.setLabel(stringVal(fm.get("label"), ""));
                    field.setType(stringVal(fm.get("type"), "input"));
                    Object ph = fm.get("placeholder");
                    if (ph != null) {
                        field.setPlaceholder(ph.toString());
                    }
                    Object dv = fm.get("defaultValue");
                    field.setDefaultValue(dv != null ? dv.toString() : "");
                    Object opt = fm.get("options");
                    if (opt instanceof List<?> ol) {
                        field.setOptions(ol.stream().map(Object::toString).toList());
                    }
                    fields.add(field);
                }
            }
        }
        payload.setFields(fields);
        return payload;
    }

    private static String stringVal(Object o, String fallback) {
        if (o == null) {
            return fallback;
        }
        String s = o.toString();
        return s.isEmpty() ? fallback : s;
    }

    private static boolean booleanVal(Object o, boolean fallback) {
        if (o == null) {
            return fallback;
        }
        if (o instanceof Boolean b) {
            return b;
        }
        if (o instanceof String s) {
            if ("true".equalsIgnoreCase(s)) {
                return true;
            }
            if ("false".equalsIgnoreCase(s)) {
                return false;
            }
        }
        return fallback;
    }

    private String serializeMode(Mode mode) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", mode.getName() != null ? mode.getName() : "");
        data.put("color", mode.getColor() != null ? mode.getColor() : "#89b4fa");
        data.put("systemPrompt", mode.getSystemPrompt() != null ? mode.getSystemPrompt() : "");
        data.put("autoIncludes", mode.getAutoIncludes() != null ? mode.getAutoIncludes() : List.of());
        data.put("rules", mode.getRules() != null ? mode.getRules() : List.of());
        return buildYaml().dump(data);
    }

    private Yaml buildYaml() {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setPrettyFlow(true);
        options.setIndent(2);
        return new Yaml(options);
    }
}
