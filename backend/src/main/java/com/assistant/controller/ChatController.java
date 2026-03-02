package com.assistant.controller;

import com.assistant.model.AssembledContext;
import com.assistant.model.ChatRequest;
import com.assistant.service.AiApiClient;
import com.assistant.service.ContextService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ContextService contextService;
    private final AiApiClient aiApiClient;

    public ChatController(ContextService contextService, AiApiClient aiApiClient) {
        this.contextService = contextService;
        this.aiApiClient = aiApiClient;
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chat(@RequestBody ChatRequest request) {
        AssembledContext context = contextService.assemble(request);

        return Flux.concat(
                // First event: send context info (included files + token count)
                Flux.just("event:context\ndata:" + toContextJson(context) + "\n\n"),
                // Then stream AI response chunks
                aiApiClient.streamChat(context.getMessages())
                        .map(chunk -> "event:token\ndata:" + escapeForSse(chunk) + "\n\n"),
                // Signal completion
                Flux.just("event:done\ndata:[DONE]\n\n")
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
}
