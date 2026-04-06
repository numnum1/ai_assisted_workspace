package com.assistant.controller;

import com.assistant.model.Mode;
import com.assistant.model.ProjectConfig;
import com.assistant.model.WorkspaceModeInfo;
import com.assistant.model.WorkspaceModeSchema;
import com.assistant.service.ModeService;
import com.assistant.service.ProjectConfigService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.swing.*;
import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;


@RestController
@RequestMapping("/api/project-config")
public class ProjectConfigController {

    private final ProjectConfigService projectConfigService;
    private final ModeService modeService;

    public ProjectConfigController(ProjectConfigService projectConfigService, ModeService modeService) {
        this.projectConfigService = projectConfigService;
        this.modeService = modeService;
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(Map.of("initialized", projectConfigService.hasProjectConfig()));
    }

    /**
     * Built-in workspace mode definition (labels, icons, meta field schemas) for the current project.
     */
    @GetMapping("/workspace-mode")
    public ResponseEntity<WorkspaceModeSchema> getWorkspaceModeSchema(
            @RequestParam(value = "id", required = false) String modeId) {
        if (modeId != null && !modeId.isBlank()) {
            return ResponseEntity.ok(projectConfigService.getWorkspaceModeSchemaById(modeId));
        }
        return ResponseEntity.ok(projectConfigService.getWorkspaceModeSchema());
    }

    /**
     * All workspace modes: built-in (classpath) and user plugins (AppData), for settings UI.
     */
    @GetMapping("/workspace-modes")
    public ResponseEntity<List<WorkspaceModeInfo>> listWorkspaceModes() {
        return ResponseEntity.ok(projectConfigService.listAvailableWorkspaceModes());
    }

    /**
     * Absolute path to the user plugin directory ({@code APPDATA/.../workspace-modes} or {@code app.data.data-dir}).
     */
    @GetMapping("/workspace-modes/data-dir")
    public ResponseEntity<Map<String, Object>> getWorkspaceModesDataDir() {
        Path dir = projectConfigService.getUserWorkspaceModesDirectory();
        Path absolute = dir.toAbsolutePath().normalize();
        boolean exists = Files.isDirectory(absolute);
        return ResponseEntity.ok(Map.of(
                "path", absolute.toString(),
                "exists", exists
        ));
    }

    /**
     * Creates the directory if missing and opens it in the system file manager (desktop only).
     */
    @PostMapping("/workspace-modes/reveal-data-dir")
    public ResponseEntity<Map<String, String>> revealWorkspaceModesDataDir() {
        try {
            Path dir = projectConfigService.getUserWorkspaceModesDirectory();
            Files.createDirectories(dir);
            File folder = dir.toAbsolutePath().normalize().toFile();
            if (!folder.isDirectory()) {
                return ResponseEntity.internalServerError().body(Map.of("error", "Could not create workspace-modes directory"));
            }
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                SwingUtilities.invokeLater(() -> {
                    try {
                        Desktop.getDesktop().open(folder);
                    } catch (Exception e) {
                        // best-effort
                    }
                });
            } else {
                new ProcessBuilder("xdg-open", folder.getAbsolutePath()).start();
            }
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage() != null ? e.getMessage() : "reveal failed"));
        }
    }

    @GetMapping
    public ResponseEntity<?> getConfig() {
        if (!projectConfigService.hasProjectConfig()) {
            return ResponseEntity.ok(new ProjectConfig());
        }
        return ResponseEntity.ok(projectConfigService.getConfig());
    }

    @PostMapping("/init")
    public ResponseEntity<?> init() {
        try {
            ProjectConfig config = projectConfigService.initProjectConfig();
            modeService.reloadModes();
            return ResponseEntity.ok(config);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to initialize: " + e.getMessage()));
        }
    }

    @PutMapping
    public ResponseEntity<?> updateConfig(@RequestBody ProjectConfig config) {
        if (!projectConfigService.hasProjectConfig()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Project config not initialized. Call /init first."));
        }
        try {
            projectConfigService.saveConfig(config);
            return ResponseEntity.ok(config);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to save config: " + e.getMessage()));
        }
    }

    // ─── Modes ───────────────────────────────────────────────────────────────────

    @GetMapping("/modes")
    public ResponseEntity<List<Mode>> getModes() {
        return ResponseEntity.ok(projectConfigService.getProjectModes());
    }

    @PutMapping("/modes/{id}")
    public ResponseEntity<?> saveMode(@PathVariable String id, @RequestBody Mode mode) {
        if (!projectConfigService.hasProjectConfig()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Project config not initialized. Call /init first."));
        }
        if (!isValidId(id)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid mode id: " + id));
        }
        mode.setId(id);
        try {
            projectConfigService.saveMode(mode);
            modeService.reloadModes();
            return ResponseEntity.ok(mode);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to save mode: " + e.getMessage()));
        }
    }

    @DeleteMapping("/modes/{id}")
    public ResponseEntity<?> deleteMode(@PathVariable String id) {
        if (!projectConfigService.hasProjectConfig()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Project config not initialized."));
        }
        try {
            boolean deleted = projectConfigService.deleteMode(id);
            if (!deleted) return ResponseEntity.notFound().build();
            modeService.reloadModes();
            return ResponseEntity.ok(Map.of("status", "deleted"));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to delete mode: " + e.getMessage()));
        }
    }

    private boolean isValidId(String id) {
        return id != null && id.matches("[a-zA-Z0-9_\\-]+");
    }
}
