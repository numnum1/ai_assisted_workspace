package com.assistant.service;

import com.assistant.model.Mode;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ModeService {

    private static final Logger log = LoggerFactory.getLogger(ModeService.class);

    private final Map<String, Mode> modes = new ConcurrentHashMap<>();
    private final ProjectConfigService projectConfigService;

    public ModeService(ProjectConfigService projectConfigService) {
        this.projectConfigService = projectConfigService;
    }

    @PostConstruct
    public void reloadModes() {
        modes.clear();
        if (projectConfigService.hasProjectConfig()) {
            loadProjectModes();
        } else {
            loadBuiltinModes();
        }
    }

    private void loadProjectModes() {
        List<Mode> projectModes = projectConfigService.getProjectModes();
        if (projectModes.isEmpty()) {
            log.info("No project modes found in .assistant/modes/, falling back to built-in modes");
            loadBuiltinModes();
            return;
        }
        for (Mode mode : projectModes) {
            modes.put(mode.getId(), mode);
        }
        log.info("Loaded {} project mode(s) from .assistant/modes/", modes.size());
    }

    private void loadBuiltinModes() {
        Yaml yaml = new Yaml();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources("classpath:modes/*.yaml");
            for (Resource resource : resources) {
                try (InputStream is = resource.getInputStream()) {
                    Map<String, Object> data = yaml.load(is);
                    Mode mode = new Mode();
                    String filename = resource.getFilename();
                    String id = filename != null ? filename.replace(".yaml", "") : "unknown";
                    mode.setId(id);
                    mode.setName((String) data.getOrDefault("name", id));
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
                    Object useReasoning = data.get("useReasoning");
                    if (useReasoning instanceof Boolean b) {
                        mode.setUseReasoning(b);
                    }
                    modes.put(id, mode);
                }
            }
            log.info("Loaded {} built-in mode(s) from classpath", modes.size());
        } catch (IOException e) {
            log.error("Failed to load built-in modes", e);
        }
    }

    public List<Mode> getAllModes() {
        return new ArrayList<>(modes.values());
    }

    public Mode getMode(String id) {
        return modes.get(id);
    }

    public Mode getDefaultMode() {
        return modes.getOrDefault("review", modes.values().stream().findFirst().orElse(null));
    }
}
