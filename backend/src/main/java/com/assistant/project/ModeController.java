package com.assistant.project;

import com.assistant.conversation.old_models_to_replace.Mode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/modes")
public class ModeController {

    private final ModeService modeService;

    public ModeController(ModeService modeService) {
        this.modeService = modeService;
    }

    @GetMapping
    public ResponseEntity<List<Mode>> getAllModes() {
        return ResponseEntity.ok(modeService.getAllModes());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Mode> getMode(@PathVariable String id) {
        Mode mode = modeService.getMode(id);
        if (mode == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(mode);
    }
}
