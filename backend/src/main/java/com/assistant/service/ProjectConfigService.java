package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.Mode;
import com.assistant.model.ProjectConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
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
        return config;
    }

    private String serializeProjectConfig(ProjectConfig config) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", config.getName() != null ? config.getName() : "");
        data.put("description", config.getDescription() != null ? config.getDescription() : "");
        data.put("alwaysInclude", config.getAlwaysInclude() != null ? config.getAlwaysInclude() : List.of());
        data.put("globalRules", config.getGlobalRules() != null ? config.getGlobalRules() : List.of());
        data.put("defaultMode", config.getDefaultMode() != null ? config.getDefaultMode() : "");
        return buildYaml().dump(data);
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
