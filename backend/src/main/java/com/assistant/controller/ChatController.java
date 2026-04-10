package com.assistant.controller;

import com.assistant.model.AssembledContext;
import com.assistant.model.ChatMessage;
import com.assistant.model.ChatRequest;
import com.assistant.model.ToolCall;
import com.assistant.service.AiApiClient;
import com.assistant.service.AiApiClient.ChatCompletionResult;
import com.assistant.service.AiProviderService;
import com.assistant.service.ContextService;
import com.assistant.service.ToolExecutor;
import com.assistant.service.tools.AskClarificationTool;
import com.assistant.service.tools.ToolkitIds;
import com.assistant.service.tools.WebSearchTool;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.net.ConnectException;
import java.net.UnknownHostException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final int MAX_TOOL_ROUNDS = 16;

    private final ContextService contextService;
    private final AiApiClient aiApiClient;
    private final ToolExecutor toolExecutor;
    private final AiProviderService aiProviderService;
    private final ObjectMapper objectMapper;

    public ChatController(ContextService contextService, AiApiClient aiApiClient, ToolExecutor toolExecutor, AiProviderService aiProviderService, ObjectMapper objectMapper) {
        this.contextService = contextService;
        this.aiApiClient = aiApiClient;
        this.toolExecutor = toolExecutor;
        this.aiProviderService = aiProviderService;
        this.objectMapper = objectMapper;
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> chat(@RequestBody ChatRequest request) {
        logIncomingChatRequest(request);

        AssembledContext context = contextService.assemble(request);
        List<Map<String, Object>> tools = toolsForRequest(request);

        boolean useReasoning = request.isQuickChat() ? false : request.isUseReasoning();
        String llmId = request.getLlmId();

        log.info(
                "Assembled chat context: mode={}, quickChat={}, llmId={}, useReasoning={}, includedFiles={} ({}), estimatedTokens={}, assembledMessages={}",
                request.getMode(),
                request.isQuickChat(),
                llmId,
                useReasoning,
                context.getIncludedFiles().size(),
                context.getIncludedFiles(),
                context.getEstimatedTokens(),
                context.getMessages().size());
        log.debug("Assembled message breakdown:\n{}", summarizeMessagesForLog(context.getMessages()));

        // The last message in the assembled context is the resolved user message (file contents prepended).
        // We send it back so the frontend can store the expanded version for future history turns.
        List<ChatMessage> assembledMessages = context.getMessages();
        String resolvedUserContent = assembledMessages.isEmpty()
                ? ""
                : assembledMessages.get(assembledMessages.size() - 1).getContent();

        log.info(
                "Resolved user message (last turn): {} chars, preview: {}",
                resolvedUserContent != null ? resolvedUserContent.length() : 0,
                previewForLog(resolvedUserContent, 600));

        return Flux.concat(
                Flux.just(ServerSentEvent.<String>builder()
                        .event("context").data(toContextJson(context, llmId)).build()),
                Flux.just(ServerSentEvent.<String>builder()
                        .event("resolved_user_message").data(escapeForSse(resolvedUserContent != null ? resolvedUserContent : "")).build()),
                Mono.fromCallable(() -> resolveToolCalls(context.getMessages(), context.getMessages().size(), tools, llmId, useReasoning))
                        .flatMapMany(resolved -> {
                            Flux<ServerSentEvent<String>> toolEvents = Flux.fromIterable(resolved.toolCallEvents());
                            Flux<ServerSentEvent<String>> toolHistoryEvent = resolved.toolHistoryJson() != null
                                    ? Flux.just(ServerSentEvent.<String>builder()
                                            .event("tool_history").data(escapeForSse(resolved.toolHistoryJson())).build())
                                    : Flux.empty();
                            Flux<ServerSentEvent<String>> contextUpdateEvent = resolved.toolCallEvents().isEmpty()
                                    ? Flux.empty()
                                    : Flux.just(ServerSentEvent.<String>builder()
                                            .event("context_update")
                                            .data("{\"estimatedTokens\":" + contextService.estimateTokensForMessages(resolved.messages()) + "}")
                                            .build());

                            Flux<ServerSentEvent<String>> tokenStream;
                            if (resolved.preGeneratedContent() != null) {
                                log.info(
                                        "Emitting pre-generated content as token stream ({} chars), skipping second API call",
                                        resolved.preGeneratedContent().length());
                                tokenStream = Flux.just(ServerSentEvent.<String>builder()
                                        .event("token").data(escapeForSse(resolved.preGeneratedContent())).build());
                            } else {
                                AtomicInteger streamChunks = new AtomicInteger();
                                AtomicInteger streamChars = new AtomicInteger();
                                log.info(
                                        "Starting assistant token stream after tool resolution: {} tool SSE events, messagesForApi={}",
                                        resolved.toolCallEvents().size(),
                                        resolved.messages().size());
                                tokenStream = aiApiClient
                                        .streamChat(resolved.messages(), tools, llmId, useReasoning)
                                        .doOnNext(chunk -> {
                                            streamChunks.incrementAndGet();
                                            streamChars.addAndGet(chunk.length());
                                        })
                                        .doOnComplete(() -> {
                                            int chunks = streamChunks.get();
                                            int chars = streamChars.get();
                                            if (chunks == 0) {
                                                log.warn(
                                                        "Assistant stream completed with 0 chunks and 0 characters — "
                                                                + "model returned no content. Likely context overflow or content filter. "
                                                                + "mode={}, llmId={}, messagesForApi={}",
                                                        request.getMode(),
                                                        llmId,
                                                        resolved.messages().size());
                                            } else {
                                                log.info("Assistant stream finished: {} chunks, {} characters", chunks, chars);
                                            }
                                        })
                                        .doOnError(e -> log.error(
                                                "Assistant stream failed after {} chunks ({} chars so far)",
                                                streamChunks.get(),
                                                streamChars.get(),
                                                e))
                                        .map(chunk -> ServerSentEvent.<String>builder()
                                                .event("token").data(escapeForSse(chunk)).build());
                            }
                            return Flux.concat(toolEvents, toolHistoryEvent, contextUpdateEvent, tokenStream);
                        })
                        .onErrorResume(e -> {
                            log.error("Chat pipeline error (mode={}, llmId={})", request.getMode(), llmId, e);
                            return Flux.just(ServerSentEvent.<String>builder()
                                    .event("error").data(toErrorMessage(e)).build());
                        }),
                Flux.just(ServerSentEvent.<String>builder()
                        .event("done").data("[DONE]").build())
        ).doOnComplete(() -> log.info("Chat SSE session completed (done event sent)"));
    }

    /**
     * Handles the tool calling loop: makes non-streaming calls to resolve tool calls,
     * then returns the final messages list ready for streaming the final response.
     *
     * @param originalMessageCount size of the messages list before any tool rounds,
     *                             used to extract only the new tool messages for tool_history
     */
    private ToolResolutionResult resolveToolCalls(List<ChatMessage> messages,
                                                  int originalMessageCount,
                                                  List<Map<String, Object>> tools,
                                                  String llmId,
                                                  boolean useReasoning) {
        List<ChatMessage> currentMessages = new ArrayList<>(messages);
        List<ServerSentEvent<String>> toolCallEvents = new ArrayList<>();
        String preGeneratedContent = null;
        log.info(
                "Tool resolution: starting with {} messages (originalCount={}), {} tool definitions registered",
                currentMessages.size(),
                originalMessageCount,
                tools != null ? tools.size() : 0);

        for (int round = 0; round < MAX_TOOL_ROUNDS; round++) {
            ChatCompletionResult result = aiApiClient.chatWithTools(currentMessages, tools, llmId, useReasoning);

            if (!result.hasToolCalls()) {
                if (result.content() != null && !result.content().isBlank()) {
                    preGeneratedContent = result.content();
                    log.info(
                            "Tool round {}: model returned text only (no tool_calls), {} chars — reusing as pre-generated content",
                            round + 1,
                            result.content().length());
                } else {
                    log.warn(
                            "Tool round {}: empty content AND no tool_calls — suspicious response, possible context overflow. "
                                    + "messages={}, approxChars={}",
                            round + 1,
                            currentMessages.size(),
                            currentMessages.stream()
                                    .mapToInt(m -> m.getContent() != null ? m.getContent().length() : 0)
                                    .sum());
                }
                break;
            }

            log.info("Tool round {}: model requested {} tool call(s)", round + 1, result.toolCalls().size());

            // Intercept ask_clarification before any messages are added to history
            boolean hasClarification = result.toolCalls().stream()
                    .anyMatch(tc -> AskClarificationTool.TOOL_NAME.equals(tc.getFunction().getName()));
            if (hasClarification) {
                ToolCall clarCall = result.toolCalls().stream()
                        .filter(tc -> AskClarificationTool.TOOL_NAME.equals(tc.getFunction().getName()))
                        .findFirst().orElseThrow();
                preGeneratedContent = buildClarificationBlock(clarCall.getFunction().getArguments());
                log.info("Tool round {}: ask_clarification intercepted — emitting clarification block as pre-generated content ({} chars)",
                        round + 1, preGeneratedContent.length());
                break;
            }

            // Send tool call events for the frontend
            for (ToolCall tc : result.toolCalls()) {
                String description = toolExecutor.describeToolCall(tc);
                log.trace("Emitting tool_call SSE event for round {}: {}", round + 1, description);
                log.info("Tool call round {}: {}", round + 1, description);
                log.debug(
                        "Tool call raw: name={}, id={}, arguments preview: {}",
                        tc.getFunction().getName(),
                        tc.getId(),
                        previewForLog(tc.getFunction().getArguments(), 1200));
                toolCallEvents.add(ServerSentEvent.<String>builder()
                        .event("tool_call").data(escapeForSse(description)).build());
            }

            // Add assistant message with tool calls
            currentMessages.add(ChatMessage.assistantWithToolCalls(result.toolCalls()));

            // Execute each tool and add results
            for (ToolCall tc : result.toolCalls()) {
                log.trace("Starting execution of tool result for round {}: name={}", round + 1, tc.getFunction().getName());
                String toolResult = toolExecutor.execute(tc);
                log.trace("Finished tool execution for round {}: name={}, result length={}", round + 1, tc.getFunction().getName(), toolResult != null ? toolResult.length() : 0);
                log.info(
                        "Tool result: name={}, id={}, {} chars, preview: {}",
                        tc.getFunction().getName(),
                        tc.getId(),
                        toolResult != null ? toolResult.length() : 0,
                        previewForLog(toolResult, 1500));
                currentMessages.add(ChatMessage.toolResult(tc.getId(), toolResult));
            }
        }

        int addedMessages = currentMessages.size() - originalMessageCount;
        log.info(
                "Tool resolution phase done: +{} intermediate message(s), total messages={}",
                addedMessages,
                currentMessages.size());

        // Build tool_history JSON from the intermediate messages added during tool rounds.
        // These are the messages between the original message list and the final list.
        String toolHistoryJson = null;
        if (currentMessages.size() > originalMessageCount) {
            List<ChatMessage> toolMessages = currentMessages.subList(originalMessageCount, currentMessages.size());
            try {
                toolHistoryJson = objectMapper.writeValueAsString(toolMessages);
                log.debug("tool_history JSON length: {} chars", toolHistoryJson.length());
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize tool_history messages", e);
            }
        }

        return new ToolResolutionResult(currentMessages, toolCallEvents, toolHistoryJson, preGeneratedContent);
    }

    @PostMapping("/sync")
    public Map<String, Object> chatSync(@RequestBody ChatRequest request) {
        log.info("chatSync: mode={}, messageLen={}", request.getMode(), request.getMessage() != null ? request.getMessage().length() : 0);
        AssembledContext context = contextService.assemble(request);
        String response = aiApiClient.chat(context.getMessages());
        log.info(
                "chatSync complete: responseChars={}, estimatedTokens={}, files={}",
                response != null ? response.length() : 0,
                context.getEstimatedTokens(),
                context.getIncludedFiles());
        log.debug("chatSync response preview: {}", previewForLog(response, 2000));
        return Map.of(
                "response", response,
                "includedFiles", context.getIncludedFiles(),
                "estimatedTokens", context.getEstimatedTokens()
        );
    }

    @PostMapping("/context-preview")
    public Map<String, Object> previewContext(@RequestBody ChatRequest request) {
        log.info("context-preview: mode={}, referencedFiles={}", request.getMode(), request.getReferencedFiles());
        AssembledContext context = contextService.assemble(request);
        log.info(
                "context-preview result: files={}, estimatedTokens={}",
                context.getIncludedFiles(),
                context.getEstimatedTokens());
        return Map.of(
                "includedFiles", context.getIncludedFiles(),
                "estimatedTokens", context.getEstimatedTokens(),
                "contextBlocks", context.getContextBlocks()
        );
    }

    private record ToolResolutionResult(
            List<ChatMessage> messages,
            List<ServerSentEvent<String>> toolCallEvents,
            String toolHistoryJson,
            String preGeneratedContent
    ) {}

    /**
     * Converts the JSON arguments of an {@code ask_clarification} tool call into a
     * {@code clarification} fenced block that the frontend renders as a question form.
     */
    @SuppressWarnings("unchecked")
    private String buildClarificationBlock(String argsJson) {
        try {
            Map<String, Object> args = objectMapper.readValue(argsJson, Map.class);
            Object questions = args.get("questions");
            String questionsJson = objectMapper.writeValueAsString(questions);
            return "```clarification\n" + questionsJson + "\n```";
        } catch (Exception e) {
            log.warn("Failed to build clarification block from args, returning empty array: {}", argsJson, e);
            return "```clarification\n[]\n```";
        }
    }

    /**
     * Tool list: respects {@link ChatRequest#isDisableTools()}, {@link ChatRequest#getDisabledToolkits()},
     * and Quick Chat ({@code web_search} only when web toolkit is allowed).
     */
    private List<Map<String, Object>> toolsForRequest(ChatRequest request) {
        log.trace("Resolving tools for request: disableTools={}, disabledToolkits={}, quickChat={}",
                request.isDisableTools(), request.getDisabledToolkits(), request.isQuickChat());
        if (request.isDisableTools()) {
            log.info("Tools disabled for this request (no tool definitions sent to API)");
            return List.of();
        }
        Set<String> disabledKits = normalizedDisabledToolkits(request);
        if (request.isQuickChat()) {
            if (disabledKits.contains(ToolkitIds.WEB)) {
                log.info("Quick Chat: web toolkit disabled — no tool definitions sent to API");
                return List.of();
            }
            List<Map<String, Object>> quick = toolExecutor.getToolDefinitionsForNames(List.of(WebSearchTool.TOOL_NAME));
            log.info("Quick Chat: sending {} tool definition(s) to API", quick.size());
            return quick;
        }
        Set<String> excludedNames = new HashSet<>();
        excludedNames.add(WebSearchTool.TOOL_NAME);
        excludedNames.addAll(toolExecutor.collectToolNamesInToolkits(disabledKits));
        List<Map<String, Object>> defs = toolExecutor.getToolDefinitionsExcluding(excludedNames);
        log.info(
                "Standard chat: sending {} tool definition(s) to API (excluded names: {})",
                defs.size(),
                excludedNames);
        return defs;
    }

    private static Set<String> normalizedDisabledToolkits(ChatRequest request) {
        Set<String> out = new HashSet<>();
        if (request.getDisabledToolkits() == null) {
            return out;
        }
        for (String k : request.getDisabledToolkits()) {
            if (k != null && !k.isBlank()) {
                out.add(k.trim());
            }
        }
        return out;
    }

    private String toContextJson(AssembledContext context, String llmId) {
        StringBuilder sb = new StringBuilder("{\"includedFiles\":[");
        var files = context.getIncludedFiles();
        for (int i = 0; i < files.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(files.get(i).replace("\"", "\\\"")).append("\"");
        }
        sb.append("],\"estimatedTokens\":").append(context.getEstimatedTokens());
        Integer maxTokens = aiProviderService.getMaxTokensForProvider(llmId);
        if (maxTokens != null) {
            sb.append(",\"maxContextTokens\":").append(maxTokens);
        }
        sb.append("}");
        return sb.toString();
    }

    private String escapeForSse(String data) {
        return data.replace("\n", "\\n").replace("\r", "");
    }

    private void logIncomingChatRequest(ChatRequest request) {
        List<ChatMessage> history = request.getHistory() != null ? request.getHistory() : List.of();
        int steeringPlanLen = request.getSteeringPlan() != null ? request.getSteeringPlan().length() : 0;
        log.info(
                "Incoming chat: mode={}, sessionKind={}, steeringPlanChars={}, llmId={}, useReasoning={}, quickChat={}, disableTools={}, disabledToolkits={}, activeFile={}, activeFieldKey={}, referencedFiles={}, historyTurns={}, rawMessageLen={}",
                request.getMode(),
                request.getSessionKind(),
                steeringPlanLen,
                request.getLlmId(),
                request.isUseReasoning(),
                request.isQuickChat(),
                request.isDisableTools(),
                request.getDisabledToolkits(),
                request.getActiveFile(),
                request.getActiveFieldKey(),
                request.getReferencedFiles(),
                history.size(),
                request.getMessage() != null ? request.getMessage().length() : 0);
        log.info("Incoming user message preview: {}", previewForLog(request.getMessage(), 800));
        if (!history.isEmpty()) {
            log.info("Client history summary:\n{}", summarizeMessagesForLog(history));
        }
    }

    private static String summarizeMessagesForLog(List<ChatMessage> messages) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage m = messages.get(i);
            String role = m.getRole();
            int len = m.getContent() != null ? m.getContent().length() : 0;
            boolean hasTools = m.getToolCalls() != null && !m.getToolCalls().isEmpty();
            sb.append("  [").append(i).append("] role=").append(role)
                    .append(" contentChars=").append(len);
            if (hasTools) {
                sb.append(" toolCalls=").append(m.getToolCalls().size());
            }
            if ("tool".equals(role) && m.getToolCallId() != null) {
                sb.append(" toolCallId=").append(m.getToolCallId());
            }
            sb.append("\n");
            if (len > 0 && !hasTools) {
                sb.append("      preview: ").append(previewForLog(m.getContent(), 220).replace("\n", "\\n")).append("\n");
            }
        }
        return sb.toString();
    }

    private static String previewForLog(String text, int maxChars) {
        if (text == null) {
            return "";
        }
        String normalized = text.replace("\r\n", "\n").replace('\r', '\n');
        if (normalized.length() <= maxChars) {
            return normalized;
        }
        return normalized.substring(0, maxChars) + " … [" + normalized.length() + " chars total]";
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
        Throwable cause = e.getCause() != null ? e.getCause() : e;
        if (cause instanceof UnknownHostException || cause instanceof ConnectException
                || (cause.getMessage() != null && cause.getMessage().contains("Failed to resolve"))) {
            log.warn("Network/DNS error while contacting AI API: {}", cause.getMessage());
            return "NETWORK_ERROR";
        }
        if (e.getMessage() != null && !e.getMessage().isBlank()) {
            return "AI error: " + e.getMessage();
        }
        return "An unexpected error occurred while contacting the AI API";
    }
}
