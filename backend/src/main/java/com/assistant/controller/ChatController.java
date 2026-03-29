package com.assistant.controller;

import com.assistant.model.AssembledContext;
import com.assistant.model.ChatMessage;
import com.assistant.model.ChatRequest;
import com.assistant.model.ToolCall;
import com.assistant.service.AiApiClient;
import com.assistant.service.AiApiClient.ChatCompletionResult;
import com.assistant.service.ContextService;
import com.assistant.service.ToolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final int MAX_TOOL_ROUNDS = 3;

    private final ContextService contextService;
    private final AiApiClient aiApiClient;
    private final ToolExecutor toolExecutor;

    public ChatController(ContextService contextService, AiApiClient aiApiClient, ToolExecutor toolExecutor) {
        this.contextService = contextService;
        this.aiApiClient = aiApiClient;
        this.toolExecutor = toolExecutor;
    }

    // TODO: reconnect to chapter structure
    // The ChatRequest currently receives activeFile: null from the frontend.
    // When ContextService is updated to inject chapter metadata, wire the active chapter ID
    // through ChatRequest so ContextService can load the correct chapter context.
    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> chat(@RequestBody ChatRequest request) {
        AssembledContext context = contextService.assemble(request);
        List<Map<String, Object>> tools = toolExecutor.getToolDefinitions();

        boolean useReasoning = request.isUseReasoning();
        String llmId = request.getLlmId();
        return Flux.concat(
                Flux.just(ServerSentEvent.<String>builder()
                        .event("context").data(toContextJson(context)).build()),
                Mono.fromCallable(() -> resolveToolCalls(context.getMessages(), tools, llmId, useReasoning))
                        .flatMapMany(resolved -> {
                            Flux<ServerSentEvent<String>> toolEvents = Flux.fromIterable(resolved.toolCallEvents());
                            Flux<ServerSentEvent<String>> contextUpdateEvent = resolved.toolCallEvents().isEmpty()
                                    ? Flux.empty()
                                    : Flux.just(ServerSentEvent.<String>builder()
                                            .event("context_update")
                                            .data("{\"estimatedTokens\":" + contextService.estimateTokensForMessages(resolved.messages()) + "}")
                                            .build());
                            Flux<ServerSentEvent<String>> tokenStream = aiApiClient
                                    .streamChat(resolved.messages(), tools, llmId, useReasoning)
                                    .map(chunk -> ServerSentEvent.<String>builder()
                                            .event("token").data(escapeForSse(chunk)).build());
                            return Flux.concat(toolEvents, contextUpdateEvent, tokenStream);
                        })
                        .onErrorResume(e -> {
                            log.error("AI API error", e);
                            return Flux.just(ServerSentEvent.<String>builder()
                                    .event("error").data(toErrorMessage(e)).build());
                        }),
                Flux.just(ServerSentEvent.<String>builder()
                        .event("done").data("[DONE]").build())
        );
    }

    /**
     * Handles the tool calling loop: makes non-streaming calls to resolve tool calls,
     * then returns the final messages list ready for streaming the final response.
     */
    private ToolResolutionResult resolveToolCalls(List<ChatMessage> messages,
                                                  List<Map<String, Object>> tools,
                                                  String llmId,
                                                  boolean useReasoning) {
        List<ChatMessage> currentMessages = new ArrayList<>(messages);
        List<ServerSentEvent<String>> toolCallEvents = new ArrayList<>();

        for (int round = 0; round < MAX_TOOL_ROUNDS; round++) {
            ChatCompletionResult result = aiApiClient.chatWithTools(currentMessages, tools, llmId, useReasoning);

            if (!result.hasToolCalls()) {
                // Don't add the content here — the streaming call that follows
                // will generate the final response. Adding it would make the AI
                // see its own answer and return an empty stream.
                break;
            }

            // Send tool call events for the frontend
            for (ToolCall tc : result.toolCalls()) {
                String description = toolExecutor.describeToolCall(tc);
                log.info("Tool call round {}: {}", round + 1, description);
                toolCallEvents.add(ServerSentEvent.<String>builder()
                        .event("tool_call").data(escapeForSse(description)).build());
            }

            // Add assistant message with tool calls
            currentMessages.add(ChatMessage.assistantWithToolCalls(result.toolCalls()));

            // Execute each tool and add results
            for (ToolCall tc : result.toolCalls()) {
                String toolResult = toolExecutor.execute(tc);
                currentMessages.add(ChatMessage.toolResult(tc.getId(), toolResult));
            }
        }

        return new ToolResolutionResult(currentMessages, toolCallEvents);
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

    private record ToolResolutionResult(
            List<ChatMessage> messages,
            List<ServerSentEvent<String>> toolCallEvents
    ) {}

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
