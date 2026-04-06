package com.assistant.controller;

import com.assistant.service.FileService;
import com.assistant.service.SnapshotService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

/**
 * REST controller for managing write_file revert snapshots.
 */
@RestController
@RequestMapping("/api/snapshots")
public class SnapshotController {

    private static final Logger log = LoggerFactory.getLogger(SnapshotController.class);

    private final SnapshotService snapshotService;
    private final FileService fileService;

    public SnapshotController(SnapshotService snapshotService, FileService fileService) {
        this.snapshotService = snapshotService;
        this.fileService = fileService;
    }

    /**
     * Returns snapshot info including old content (for client-side diff rendering).
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getSnapshot(@PathVariable String id) {
        log.trace("Received request to get snapshot: {}", id);
        SnapshotService.Snapshot snapshot = snapshotService.get(id);
        if (snapshot == null) {
            return ResponseEntity.notFound().build();
        }
        log.trace("Finished getting snapshot: {}", id);
        return ResponseEntity.ok(Map.of(
            "id", id,
            "path", snapshot.path(),
            "oldContent", snapshot.oldContent(),
            "wasNew", snapshot.wasNew()
        ));
    }

    /**
     * Reverts a file to its pre-write_file state and discards the snapshot.
     */
    @PostMapping("/{id}/revert")
    public ResponseEntity<Map<String, Object>> revert(@PathVariable String id) throws IOException {
        log.trace("Received request to revert snapshot: {}", id);
        SnapshotService.Snapshot snapshot = snapshotService.get(id);
        if (snapshot == null) {
            return ResponseEntity.notFound().build();
        }

        if (snapshot.wasNew()) {
            try {
                fileService.deleteFile(snapshot.path());
                log.trace("Deleted newly created file: {}", snapshot.path());
            } catch (IOException e) {
                log.warn("Could not delete newly created file {}: {}", snapshot.path(), e.getMessage());
            }
        } else {
            fileService.writeFile(snapshot.path(), snapshot.oldContent());
            log.trace("Restored old content for: {}", snapshot.path());
        }

        snapshotService.discard(id);
        log.trace("Finished reverting snapshot {} for path: {}", id, snapshot.path());
        return ResponseEntity.ok(Map.of(
            "status", "reverted",
            "path", snapshot.path(),
            "wasNew", snapshot.wasNew()
        ));
    }

    /**
     * Applies (discards) a snapshot without reverting — user accepted the change.
     */
    @PostMapping("/{id}/apply")
    public ResponseEntity<Map<String, String>> apply(@PathVariable String id) {
        log.trace("Received request to apply snapshot: {}", id);
        if (!snapshotService.has(id)) {
            return ResponseEntity.notFound().build();
        }
        snapshotService.discard(id);
        log.trace("Finished applying snapshot: {}", id);
        return ResponseEntity.ok(Map.of("status", "applied"));
    }
}
