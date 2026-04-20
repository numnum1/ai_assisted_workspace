package com.assistant.service;

import com.assistant.model.AgentPreset;
import com.assistant.model.conversation.AgentAssistantRole;
import com.assistant.model.conversation.AgenticConversation;
import com.assistant.model.conversation.Conversation;
import com.assistant.model.conversation.ConversationPatch;
import com.assistant.model.conversation.GuidedConversation;
import com.assistant.model.conversation.NormalConversation;
import com.assistant.model.conversation.NonAgenticGuidedConversation;
import com.assistant.model.conversation.Plan;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ChatHistoryService {

    private static final Logger log = LoggerFactory.getLogger(ChatHistoryService.class);

    public static final String CHAT_HISTORY_RELATIVE_PATH = ".assistant/chat-history.json";

    private final FileService fileService;
    private final ObjectMapper objectMapper;
    private final ProjectConfigService projectConfigService;

    public ChatHistoryService(FileService fileService, ObjectMapper objectMapper, ProjectConfigService projectConfigService) {
        this.fileService = fileService;
        this.objectMapper = objectMapper;
        this.projectConfigService = projectConfigService;
    }

    public List<Conversation> loadAll() {
        log.trace("Received request to load all conversations from {}", CHAT_HISTORY_RELATIVE_PATH);
        try {
            if (!fileService.fileExists(CHAT_HISTORY_RELATIVE_PATH)) {
                log.trace("Finished loading conversations: file missing, returning empty list");
                return new ArrayList<>();
            }
            String raw = fileService.readFile(CHAT_HISTORY_RELATIVE_PATH);
            JsonNode root = objectMapper.readTree(raw);
            if (!root.isArray()) {
                log.warn("chat-history.json is not a JSON array; returning empty list");
                log.trace("Finished loading conversations: invalid root, empty list");
                return new ArrayList<>();
            }
            List<Conversation> out = new ArrayList<>();
            for (JsonNode el : root) {
                if (!el.isObject()) {
                    continue;
                }
                String t = el.path("type").asText("");
                try {
                    Conversation c = switch (t) {
                        case "NORMAL" -> objectMapper.treeToValue(el, NormalConversation.class);
                        case "NON_AGENTIC_GUIDED" -> objectMapper.treeToValue(el, NonAgenticGuidedConversation.class);
                        case "AGENTIC_GUIDED" -> objectMapper.treeToValue(el, AgenticConversation.class);
                        default -> {
                            log.warn("Skipping conversation with unknown type: {}", t);
                            yield null;
                        }
                    };
                    if (c != null) {
                        materializeAgenticIfNeeded(c);
                        out.add(c);
                    }
                } catch (Exception e) {
                    log.warn("Skipping malformed conversation entry (type={}): {}", t, e.getMessage());
                }
            }
            log.trace("Finished loading conversations: count={}", out.size());
            return out;
        } catch (IOException e) {
            log.error("Failed to load chat history", e);
            throw new IllegalStateException("Could not load chat history", e);
        }
    }

    private void materializeAgenticIfNeeded(Conversation c) {
        if (!(c instanceof AgenticConversation ac)) {
            return;
        }
        if (!StringUtils.hasText(ac.getAgentPresetId())) {
            return;
        }
        for (AgentPreset p : projectConfigService.listAgentPresets()) {
            if (ac.getAgentPresetId().equals(p.getId())) {
                AgentAssistantRole role = ac.getAssistant();
                if (role != null) {
                    role.applyFromPreset(p);
                }
                Plan plan = ac.getPlan();
                if (plan != null && (!StringUtils.hasText(plan.getContent()) || !StringUtils.hasText(plan.getTitle()))) {
                    if (StringUtils.hasText(p.getInitialSteeringPlan()) && !StringUtils.hasText(plan.getContent())) {
                        plan.setContent(p.getInitialSteeringPlan());
                    }
                    if (!StringUtils.hasText(plan.getTitle()) && StringUtils.hasText(p.getName())) {
                        plan.setTitle(p.getName());
                    }
                }
                return;
            }
        }
        log.debug("No agent preset found for id={}", ac.getAgentPresetId());
    }

    public void saveAll(List<Conversation> conversations) {
        log.trace("Received request to save {} conversations to {}", conversations.size(), CHAT_HISTORY_RELATIVE_PATH);
        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(conversations);
            fileService.writeFile(CHAT_HISTORY_RELATIVE_PATH, json);
            log.trace("Finished saving conversations successfully");
        } catch (IOException e) {
            log.error("Failed to write chat history", e);
            throw new IllegalStateException("Could not save chat history", e);
        }
    }

    public Optional<Conversation> findById(String id) {
        log.trace("Received request to find conversation by id={}", id);
        Optional<Conversation> r = loadAll().stream().filter(c -> id.equals(c.getId())).findFirst();
        log.trace("Finished findById: present={}", r.isPresent());
        return r;
    }

    public Conversation save(Conversation conversation, ConversationValidator validator) {
        log.trace("Received request to save conversation id={}", conversation.getId());
        validator.validate(conversation);
        long now = System.currentTimeMillis();
        if (conversation.getCreatedAt() <= 0) {
            conversation.setCreatedAt(now);
        }
        conversation.setUpdatedAt(now);

        List<Conversation> all = new ArrayList<>(loadAll());
        all.removeIf(c -> conversation.getId().equals(c.getId()));
        all.add(conversation);
        saveAll(all);
        log.trace("Finished save conversation id={}", conversation.getId());
        return conversation;
    }

    public Conversation create(Conversation conversation, ConversationValidator validator) {
        log.trace("Received request to create conversation");
        if (!StringUtils.hasText(conversation.getId())) {
            conversation.setId(UUID.randomUUID().toString());
        }
        Conversation saved = save(conversation, validator);
        log.trace("Finished create conversation id={}", saved.getId());
        return saved;
    }

    public void delete(String id) {
        log.trace("Received request to delete conversation id={}", id);
        List<Conversation> all = new ArrayList<>(loadAll());
        boolean removed = all.removeIf(c -> id.equals(c.getId()));
        if (removed) {
            saveAll(all);
        }
        log.trace("Finished delete conversation id={}, removed={}", id, removed);
    }

    public Conversation patch(String id, ConversationPatch patch, ConversationValidator validator) {
        log.trace("Received request to patch conversation id={}", id);
        validator.validatePatch(id, patch.getId());
        Conversation existing = findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Conversation not found: " + id));
        if (StringUtils.hasText(patch.getTitle())) {
            existing.setTitle(patch.getTitle());
        }
        if (patch.getSavedToProject() != null) {
            existing.setSavedToProject(patch.getSavedToProject());
        }
        if (existing instanceof GuidedConversation gc) {
            Plan plan = gc.getPlan();
            if (plan != null) {
                if (StringUtils.hasText(patch.getPlanTitle())) {
                    plan.setTitle(patch.getPlanTitle());
                }
                if (patch.getPlanContent() != null) {
                    plan.setContent(patch.getPlanContent());
                }
            }
        }
        existing.setUpdatedAt(System.currentTimeMillis());
        validator.validate(existing);
        List<Conversation> all = new ArrayList<>(loadAll());
        for (Iterator<Conversation> it = all.iterator(); it.hasNext(); ) {
            if (id.equals(it.next().getId())) {
                it.remove();
                break;
            }
        }
        all.add(existing);
        saveAll(all);
        log.trace("Finished patch conversation id={}", id);
        return existing;
    }

    public void replaceAll(List<Conversation> conversations) {
        log.trace("Received request to replace entire chat history with {} conversations", conversations.size());
        saveAll(conversations);
        log.trace("Finished replaceAll chat history");
    }
}
