package com.assistant.controller;

import com.assistant.model.PlanningNode;
import com.assistant.service.FileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/planning")
public class PlanningController {

    private final FileService fileService;

    public PlanningController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping("/outline")
    public ResponseEntity<List<PlanningNode>> getOutline() {
        try {
            return ResponseEntity.ok(fileService.getPlanningOutline());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
