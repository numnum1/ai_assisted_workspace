package com.assistant.controller;

import com.assistant.config.AppConfig;
import com.assistant.model.FileNode;
import com.assistant.service.FileService;
import com.assistant.service.ModeService;
import com.assistant.service.ProjectConfigService;
import com.assistant.service.UserPreferencesService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.swing.*;
import java.awt.Desktop;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@RestController
@RequestMapping("/api/project")
public class ProjectController {

    private final AppConfig appConfig;
    private final FileService fileService;
    private final ModeService modeService;
    private final ProjectConfigService projectConfigService;
    private final UserPreferencesService userPreferencesService;

    public ProjectController(AppConfig appConfig, FileService fileService,
                             ModeService modeService, ProjectConfigService projectConfigService,
                             UserPreferencesService userPreferencesService) {
        this.appConfig = appConfig;
        this.fileService = fileService;
        this.modeService = modeService;
        this.projectConfigService = projectConfigService;
        this.userPreferencesService = userPreferencesService;
    }

    @GetMapping("/current")
    public ResponseEntity<Map<String, Object>> current() {
        String path = appConfig.getProject().getPath();
        boolean hasProject = path != null && !path.isBlank() && Files.isDirectory(Path.of(path));
        boolean initialized = hasProject && projectConfigService.hasProjectConfig();
        return ResponseEntity.ok(Map.of(
                "path", path != null ? path : "",
                "hasProject", hasProject,
                "initialized", initialized
        ));
    }

    @PostMapping("/reveal")
    public ResponseEntity<Map<String, String>> revealInExplorer() {
        String path = appConfig.getProject().getPath();
        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No project open"));
        }
        File dir = new File(path);
        if (!dir.isDirectory()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Path is not a directory"));
        }
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                SwingUtilities.invokeLater(() -> {
                    try {
                        Desktop.getDesktop().open(dir);
                    } catch (Exception e) {
                        // best-effort
                    }
                });
            } else {
                // Fallback for Linux/headless environments
                new ProcessBuilder("xdg-open", path).start();
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/browse")
    public ResponseEntity<Map<String, Object>> browse() {
        AtomicReference<String> selectedPath = new AtomicReference<>();

        try {
            SwingUtilities.invokeAndWait(() -> {
                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                chooser.setDialogTitle("Open Project Folder");

                String currentPath = appConfig.getProject().getPath();
                if (currentPath != null && !currentPath.isBlank()) {
                    chooser.setCurrentDirectory(new java.io.File(currentPath));
                }

                int result = chooser.showOpenDialog(frame);
                frame.dispose();

                if (result == JFileChooser.APPROVE_OPTION) {
                    selectedPath.set(chooser.getSelectedFile().getAbsolutePath());
                }
            });
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to open folder dialog: " + e.getMessage()));
        }

        if (selectedPath.get() == null) {
            return ResponseEntity.ok(Map.of("cancelled", true));
        }

        return ResponseEntity.ok(Map.of("cancelled", false, "path", selectedPath.get()));
    }

    @PostMapping("/open")
    public ResponseEntity<?> open(@RequestBody Map<String, String> body) {
        String requestedPath = body.get("path");
        if (requestedPath == null || requestedPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Path is required"));
        }

        Path dir = Path.of(requestedPath);
        if (!Files.isDirectory(dir)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Not a valid directory: " + requestedPath));
        }

        appConfig.getProject().setPath(requestedPath);
        userPreferencesService.saveLastOpenedPath(requestedPath);
        modeService.reloadModes();

        try {
            FileNode tree = fileService.getFileTree();
            boolean initialized = projectConfigService.hasProjectConfig();
            return ResponseEntity.ok(Map.of(
                    "status", "opened",
                    "path", requestedPath,
                    "tree", tree,
                    "initialized", initialized
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to read directory: " + e.getMessage()));
        }
    }
}
