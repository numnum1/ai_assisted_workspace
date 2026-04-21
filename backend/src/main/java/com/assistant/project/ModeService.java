package com.assistant.project;

import com.assistant.conversation.model.Mode;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

@Service
@DependsOn({ "userPreferencesService", "llmService" })
public class ModeService {

    private static final Logger log = LoggerFactory.getLogger(
        ModeService.class
    );

    private final Map<String, Mode<LLMConfig>> modes =
        new ConcurrentHashMap<>();
    private final ProjectConfigService projectConfigService;
    private final LLMs llms;

    public ModeService(ProjectConfigService projectConfigService, LLMs llms) {
        this.projectConfigService = projectConfigService;
        this.llms = llms;
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
        List<ModeAndId> projectModes = projectConfigService.getProjectModes();
        if (projectModes.isEmpty()) {
            log.info(
                "No project modes found in .assistant/modes/, falling back to built-in modes"
            );
            loadBuiltinModes();
            return;
        }
        for (ModeAndId modeWithId : projectModes) {
            modes.put(modeWithId.id(), modeWithId.mode());
        }
        log.info(
            "Loaded {} project mode(s) from .assistant/modes/",
            modes.size()
        );
    }

    private void loadBuiltinModes() {
        Yaml yaml = new Yaml();
        PathMatchingResourcePatternResolver resolver =
            new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources(
                "classpath:modes/*.yaml"
            );
            for (Resource resource : resources) {
                try (InputStream is = resource.getInputStream()) {
                    Map<String, Object> data = yaml.load(is);
                    String filename = resource.getFilename();
                    String id =
                        filename != null
                            ? filename.replace(".yaml", "")
                            : "unknown";
                    Mode<LLMConfig> mode = new Mode<>(
                        (String) data.getOrDefault("name", id),
                        (String) data.getOrDefault("systemPrompt", ""),
                        (String) data.getOrDefault("color", "#89b4fa"),
                        (Boolean) data.get("agentOnly"),
                        llms
                            .find((String) data.get("llmId"))
                            .orElseThrow(() ->
                                new IllegalStateException(
                                    "Missing llm with id: " + data.get("llmId")
                                )
                            ),
                        (Boolean) data.get("useReasoning")
                    );
                    modes.put(id, mode);
                }
            }
            log.info("Loaded {} built-in mode(s) from classpath", modes.size());
        } catch (IOException e) {
            log.error("Failed to load built-in modes", e);
        }
    }

    public List<Mode<LLMConfig>> getAllModes() {
        return new ArrayList<>(modes.values());
    }

    public Mode<LLMConfig> getMode(String id) {
        return modes.get(id);
    }

    public Mode<LLMConfig> getDefaultMode() {
        return modes.getOrDefault(
            "review",
            modes.values().stream().findFirst().orElse(null)
        );
    }
}
