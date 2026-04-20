package com.assistant.conversation;

import com.assistant.conversation.model.Conversation;
import com.assistant.conversation.model.ConversationPatch;
import com.assistant.conversation.history.ChatHistoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private static final Logger log = LoggerFactory.getLogger(ConversationController.class);

    private final ChatHistoryService chatHistoryService;
    private final ConversationValidator conversationValidator;

    public ConversationController(ChatHistoryService chatHistoryService, ConversationValidator conversationValidator) {
        this.chatHistoryService = chatHistoryService;
        this.conversationValidator = conversationValidator;
    }

    @GetMapping
    public ResponseEntity<List<Conversation>> list() {
        log.trace("Received request GET /api/conversations");
        List<Conversation> list = chatHistoryService.loadAll();
        log.trace("Finished GET /api/conversations: count={}", list.size());
        return ResponseEntity.ok(list);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Conversation> get(@PathVariable String id) {
        log.trace("Received request GET /api/conversations/{}", id);
        return chatHistoryService.findById(id)
                .map(c -> {
                    log.trace("Finished GET /api/conversations/{}: found", id);
                    return ResponseEntity.ok(c);
                })
                .orElseGet(() -> {
                    log.trace("Finished GET /api/conversations/{}: not found", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<Conversation> create(@RequestBody Conversation body) {
        log.trace("Received request POST /api/conversations");
        try {
            Conversation created = chatHistoryService.create(body, conversationValidator);
            log.trace("Finished POST /api/conversations: id={}", created.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(created);
        } catch (IllegalArgumentException e) {
            log.warn("POST /api/conversations validation failed: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<Conversation> put(@PathVariable String id, @RequestBody Conversation body) {
        log.trace("Received request PUT /api/conversations/{}", id);
        if (!StringUtils.hasText(body.getId())) {
            body.setId(id);
        }
        if (!id.equals(body.getId())) {
            log.warn("PUT id mismatch path={} body={}", id, body.getId());
            return ResponseEntity.badRequest().build();
        }
        try {
            Conversation saved = chatHistoryService.save(body, conversationValidator);
            log.trace("Finished PUT /api/conversations/{}", id);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            log.warn("PUT /api/conversations/{} validation failed: {}", id, e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Conversation> patch(@PathVariable String id, @RequestBody ConversationPatch patch) {
        log.trace("Received request PATCH /api/conversations/{}", id);
        try {
            Conversation updated = chatHistoryService.patch(id, patch, conversationValidator);
            log.trace("Finished PATCH /api/conversations/{}", id);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            log.warn("PATCH /api/conversations/{} failed: {}", id, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        log.trace("Received request DELETE /api/conversations/{}", id);
        chatHistoryService.delete(id);
        log.trace("Finished DELETE /api/conversations/{}", id);
        return ResponseEntity.noContent().build();
    }
}
