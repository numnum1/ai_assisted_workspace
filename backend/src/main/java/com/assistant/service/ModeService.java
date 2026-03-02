package com.assistant.service;

import com.assistant.model.Mode;
import jakarta.annotation.PostConstruct;
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

    private final Map<String, Mode> modes = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadModes() throws IOException {
        Yaml yaml = new Yaml();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
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

                Object autoIncludes = data.get("autoIncludes");
                if (autoIncludes instanceof List<?> list) {
                    mode.setAutoIncludes(list.stream().map(Object::toString).toList());
                }

                modes.put(id, mode);
            }
        }
    }

    public List<Mode> getAllModes() {
        return new ArrayList<>(modes.values());
    }

    public Mode getMode(String id) {
        return modes.get(id);
    }

    public Mode getDefaultMode() {
        return modes.getOrDefault("review", modes.values().iterator().next());
    }
}
