package com.assistant.service;

import com.assistant.config.AppConfig;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class UserPreferencesService {

    private static final Logger log = LoggerFactory.getLogger(UserPreferencesService.class);
    private static final String LAST_PROJECT_FILE = "last-opened-project.txt";

    private final AppConfig appConfig;
    private final ProjectConfigService projectConfigService;

    public UserPreferencesService(AppConfig appConfig, ProjectConfigService projectConfigService) {
        this.appConfig = appConfig;
        this.projectConfigService = projectConfigService;
    }

    /**
     * On startup, restore the last opened project path from the preferences file,
     * overriding any static path configured in application.yml.
     * If the saved path no longer exists, the configured YAML path is kept as fallback.
     */
    @PostConstruct
    public void restoreLastOpenedProject() {
        log.trace("Checking for saved last-opened project preference");
        try {
            Path prefsFile = projectConfigService.getAppDataDirectory().resolve(LAST_PROJECT_FILE);
            if (!Files.exists(prefsFile)) {
                log.trace("No saved project preference found, using configured path");
                return;
            }
            String lastPath = Files.readString(prefsFile).strip();
            if (lastPath.isBlank()) {
                log.trace("Saved project preference is empty, using configured path");
                return;
            }
            if (!Files.isDirectory(Path.of(lastPath))) {
                log.trace("Saved project path no longer exists: {}, keeping configured path", lastPath);
                return;
            }
            log.trace("Restoring last opened project from preferences: {}", lastPath);
            appConfig.getProject().setPath(lastPath);
            log.trace("Successfully restored last opened project: {}", lastPath);
        } catch (Exception e) {
            log.error("Failed to restore last opened project preference", e);
        }
    }

    public void saveLastOpenedPath(String path) {
        log.trace("Saving last opened project path: {}", path);
        try {
            Path appDataDir = projectConfigService.getAppDataDirectory();
            Files.createDirectories(appDataDir);
            Files.writeString(appDataDir.resolve(LAST_PROJECT_FILE), path);
            log.trace("Successfully saved last opened project path: {}", path);
        } catch (Exception e) {
            log.error("Failed to save last opened project path: {}", path, e);
        }
    }
}
