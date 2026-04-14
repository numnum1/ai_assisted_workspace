package com.assistant.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory store for file revert snapshots created by the write_file AI tool.
 * Each snapshot holds the old content of a file before the AI overwrote it.
 * Snapshots are cleared on apply or when explicitly discarded.
 */
@Service
public class SnapshotService {

    private static final Logger log = LoggerFactory.getLogger(SnapshotService.class);

    public record Snapshot(String path, String oldContent, boolean wasNew) {}

    private final Map<String, Snapshot> snapshots = new ConcurrentHashMap<>();

    public String save(String path, String oldContent, boolean wasNew) {
        String id = UUID.randomUUID().toString();
        snapshots.put(id, new Snapshot(path, oldContent, wasNew));
        log.trace("Saved snapshot {} for path: {} (wasNew={})", id, path, wasNew);
        return id;
    }

    public Snapshot get(String id) {
        return snapshots.get(id);
    }

    public void discard(String id) {
        Snapshot removed = snapshots.remove(id);
        if (removed != null) {
            log.trace("Discarded snapshot {} for path: {}", id, removed.path());
        }
    }

    public boolean has(String id) {
        return snapshots.containsKey(id);
    }
}
