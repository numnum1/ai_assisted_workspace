package com.assistant.project;

import com.assistant.conversation.model.Mode;
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
    public ResponseEntity<List<Mode<?>>> getAllModes() {
        return ResponseEntity.ok(new java.util.ArrayList<>(modeService.getAllModes()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Mode<?>> getMode(@PathVariable String id) {
        Mode<?> mode = modeService.getMode(id);
        if (mode == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(mode);
    }
}
