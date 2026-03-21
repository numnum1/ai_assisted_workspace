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
    public ResponseEntity<StructureNodeMeta> getBookMeta() throws IOException {
        return ResponseEntity.ok(chapterService.getBookMeta());
    }

    @PutMapping("/meta")
    public ResponseEntity<Map<String, String>> updateBookMeta(
            @RequestBody StructureNodeMeta meta) throws IOException {
        chapterService.updateBookMeta(meta);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }
}
