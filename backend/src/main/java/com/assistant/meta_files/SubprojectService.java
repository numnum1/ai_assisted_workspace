package com.assistant.meta_files;

import com.assistant.file_services.FileService;
import com.assistant.project.ProjectConfigService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class SubprojectService {

    public static final String SUBPROJECT_FILENAME = ".subproject.json";

    private final FileService fileService;
    private final ProjectConfigService projectConfigService;
    private final ObjectMapper objectMapper;

    public SubprojectService(FileService fileService,
                             ProjectConfigService projectConfigService,
                             ObjectMapper objectMapper) {
        this.fileService = fileService;
        this.projectConfigService = projectConfigService;
        this.objectMapper = objectMapper;
    }

    /**
     * @param relativePath folder path relative to project root (e.g. {@code my-book})
     */
    public SubprojectConfig getInfo(String relativePath) throws IOException {
        Path dir = fileService.resolveRelativeDirectory(relativePath);
        Path file = dir.resolve(SUBPROJECT_FILENAME);
        if (!Files.isRegularFile(file)) {
            return null;
        }
        return objectMapper.readValue(file.toFile(), SubprojectConfig.class);
    }

    public void init(String relativePath, String type, String name) throws IOException {
        if (type == null || type.isBlank()) {
            throw new IllegalArgumentException("type is required");
        }
        if ("default".equalsIgnoreCase(type.trim())) {
            throw new IllegalArgumentException("Cannot use workspace mode 'default' as a subproject type");
        }
        if (projectConfigService.loadBuiltinWorkspaceModeYaml(type.trim()) == null) {
            throw new IllegalArgumentException("Unknown workspace mode type: " + type);
        }
        Path dir = fileService.resolveRelativeDirectory(relativePath);
        SubprojectConfig cfg = new SubprojectConfig();
        cfg.setType(type.trim());
        cfg.setName(name != null ? name.trim() : "");
        Path file = dir.resolve(SUBPROJECT_FILENAME);
        Files.writeString(file, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(cfg), StandardCharsets.UTF_8);
    }

    public void remove(String relativePath) throws IOException {
        Path dir = fileService.resolveRelativeDirectory(relativePath);
        Path file = dir.resolve(SUBPROJECT_FILENAME);
        if (Files.isRegularFile(file)) {
            Files.delete(file);
        }
    }
}
