package com.assistant.conversation;

import com.assistant.conversation.history.ChatHistoryService;
import com.assistant.conversation.model.Conversation;
import com.assistant.conversation.model.ConversationPatch;
import com.assistant.conversation.model.NormalConversation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private static final Logger log = LoggerFactory.getLogger(ConversationController.class);

    private final ChatHistoryService chatHistoryService;
    private final ConversationValidator validator;

    public ConversationController(ChatHistoryService chatHistoryService, ConversationValidator validator) {
        this.chatHistoryService = chatHistoryService;
        this.validator = validator;
    }

    @GetMapping
    public ResponseEntity<List<Conversation>> getAll() {
        log.trace("Received request to list all conversations");
        List<Conversation> all = chatHistoryService.loadAll();
        log.trace("Finished listing conversations: count={}", all.size());
        return ResponseEntity.ok(all);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Conversation> getById(@PathVariable String id) {
        log.trace("Received request to get conversation id={}", id);
        return chatHistoryService.findById(id)
                .map(c -> {
                    log.trace("Finished get conversation id={}", id);
                    return ResponseEntity.ok(c);
                })
                .orElseGet(() -> {
                    log.trace("Conversation not found id={}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<Conversation> create(@RequestBody Conversation conversation) {
        log.trace("Received request to create conversation title={}", conversation.getTitle());
        if (conversation.getTitle() == null || conversation.getTitle().isBlank()) {
            conversation.setTitle("Neuer Chat");
        }
        if (conversation instanceof NormalConversation nc && nc.getAssistant() == null) {
        }
        Conversation created = chatHistoryService.create(conversation, validator);
        log.trace("Finished create conversation id={}", created.getId());
        return ResponseEntity.ok(created);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Conversation> patch(@PathVariable String id, @RequestBody ConversationPatch patch) {
        log.trace("Received request to patch conversation id={}", id);
        try {
            Conversation updated = chatHistoryService.patch(id, patch, validator);
            log.trace("Finished patch conversation id={}", id);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            log.trace("Conversation not found for patch id={}", id);
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<Conversation> replace(@PathVariable String id, @RequestBody Conversation conversation) {
        log.trace("Received request to replace conversation id={}", id);
        conversation.setId(id);
        if (!chatHistoryService.findById(id).isPresent()) {
            log.trace("Conversation not found for replace id={}", id);
            return ResponseEntity.notFound().build();
        }
        Conversation saved = chatHistoryService.save(conversation, validator);
        log.trace("Finished replace conversation id={}", id);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        log.trace("Received request to delete conversation id={}", id);
        chatHistoryService.delete(id);
        log.trace("Finished delete conversation id={}", id);
        return ResponseEntity.noContent().build();
    }
}
