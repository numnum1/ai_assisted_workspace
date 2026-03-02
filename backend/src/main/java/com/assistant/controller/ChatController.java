package com.assistant.controller;

import com.assistant.model.AssembledContext;
import com.assistant.model.ChatRequest;
import com.assistant.service.AiApiClient;
import com.assistant.service.ContextService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;

import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ContextService contextService;
    private final AiApiClient aiApiClient;

    public ChatController(ContextService contextService, AiApiClient aiApiClient) {
        this.contextService = contextService;
        this.aiApiClient = aiApiClient;
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> chat(@RequestBody ChatRequest request) {
        AssembledContext context = contextService.assemble(request);

        return Flux.concat(
                Flux.just(ServerSentEvent.<String>builder()
                        .event("context").data(toContextJson(context)).build()),
                aiApiClient.streamChat(context.getMessages())
                        .map(chunk -> ServerSentEvent.<String>builder()
                                .event("token").data(escapeForSse(chunk)).build())
                        .onErrorResume(e -> {
                            log.error("AI API streaming error", e);
                            return Flux.just(ServerSentEvent.<String>builder()
                                    .event("error").data(toErrorMessage(e)).build());
                        }),
                Flux.just(ServerSentEvent.<String>builder()
                        .event("done").data("[DONE]").build())
        );
    }

    @PostMapping("/sync")
    public Map<String, Object> chatSync(@RequestBody ChatRequest request) {
        AssembledContext context = contextService.assemble(request);
        String response = aiApiClient.chat(context.getMessages());
        return Map.of(
                "response", response,
                "includedFiles", context.getIncludedFiles(),
                "estimatedTokens", context.getEstimatedTokens()
        );
    }

    @PostMapping("/context-preview")
    public Map<String, Object> previewContext(@RequestBody ChatRequest request) {
        AssembledContext context = contextService.assemble(request);
        return Map.of(
                "includedFiles", context.getIncludedFiles(),
                "estimatedTokens", context.getEstimatedTokens()
        );
    }

    private String toContextJson(AssembledContext context) {
        StringBuilder sb = new StringBuilder("{\"includedFiles\":[");
        var files = context.getIncludedFiles();
        for (int i = 0; i < files.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(files.get(i).replace("\"", "\\\"")).append("\"");
        }
        sb.append("],\"estimatedTokens\":").append(context.getEstimatedTokens()).append("}");
        return sb.toString();
    }

    private String escapeForSse(String data) {
        return data.replace("\n", "\\n").replace("\r", "");
    }

    private String toErrorMessage(Throwable e) {
        if (e instanceof WebClientResponseException wce) {
            int status = wce.getStatusCode().value();
            return switch (status) {
                case 401 -> "AI API authentication failed (401) — check your API key";
                case 429 -> "AI API rate limit exceeded (429) — try again later";
                case 500, 502, 503 -> "AI API is temporarily unavailable (" + status + ") — try again later";
                default -> "AI API error (" + status + ")";
            };
        }
        if (e.getMessage() != null && !e.getMessage().isBlank()) {
            return "AI error: " + e.getMessage();
        }
        return "An unexpected error occurred while contacting the AI API";
    }
}
