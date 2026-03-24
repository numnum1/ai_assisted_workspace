package com.assistant.controller;

import com.assistant.model.StructureNodeMeta;
import com.assistant.service.ChapterService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/book")
public class BookController {

    private final ChapterService chapterService;

    public BookController(ChapterService chapterService) {
        this.chapterService = chapterService;
    }

    @GetMapping("/meta")
    public ResponseEntity<StructureNodeMeta> getBookMeta(
            @RequestParam(value = "root", required = false) String root) throws IOException {
        String wr = (root == null || root.isBlank() || ".".equals(root)) ? null : root;
        return ResponseEntity.ok(chapterService.getBookMeta(wr));
    }

    @PutMapping("/meta")
    public ResponseEntity<Map<String, String>> updateBookMeta(
            @RequestParam(value = "root", required = false) String root,
            @RequestBody StructureNodeMeta meta) throws IOException {
        String wr = (root == null || root.isBlank() || ".".equals(root)) ? null : root;
        chapterService.updateBookMeta(wr, meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }
}
