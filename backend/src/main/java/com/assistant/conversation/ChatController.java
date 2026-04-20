package com.assistant.conversation;

import com.assistant.meta_files.AssembledContext;
import com.assistant.ai_provider.old_models.ChatMessage;
import com.assistant.ai_provider.old_models.ChatRequest;
import com.assistant.ai_provider.old_models.ToolCall;
import com.assistant.ai_provider.AiApiClient;
import com.assistant.ai_provider.AiProviderService;
import com.assistant.conversation.services.ChatCompletionStreamParser;
import com.assistant.context.ContextService;
import com.assistant.tools.ToolExecutor;
import com.assistant.tools.AskClarificationTool;
import com.assistant.tools.ProposeGuidedThreadTool;
import com.assistant.tools.ToolkitIds;
import com.assistant.tools.WebSearchTool;
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
import reactor.core.publisher.FluxSink;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final int MAX_TOOL_ROUNDS = 16;

    /**
     * Codepoints per SSE {@code token} event when emitting {@code preGeneratedContent} (no second LLM call).
     * UTF-16-safe boundaries via {@link String#offsetByCodePoints}.
     */
    private static final int PRE_GENERATED_SSE_CHUNK_CODE_POINTS = 48;

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

        Flux<ServerSentEvent<String>> assistantPhase =
                (tools == null || tools.isEmpty())
                        ? Mono.fromCallable(() -> skipToolResolutionForDirectStreaming(context.getMessages()))
                                .flatMapMany(r -> resolvedToClientFlux(r, request, tools, llmId, useReasoning))
                        : toolResolutionStreamingFlux(
                                context.getMessages(), tools, llmId, useReasoning, request);

        return Flux.concat(
                        Flux.just(ServerSentEvent.<String>builder()
                                .event("context").data(toContextJson(context, llmId)).build()),
                        Flux.just(ServerSentEvent.<String>builder()
                                .event("resolved_user_message")
                                        .data(escapeForSse(resolvedUserContent != null ? resolvedUserContent : ""))
                                        .build()),
                        assistantPhase.onErrorResume(e -> {
                            log.error("Chat pipeline error (mode={}, llmId={})", request.getMode(), llmId, e);
                            return Flux.just(ServerSentEvent.<String>builder()
                                    .event("error").data(toErrorMessage(e)).build());
                        }),
                        Flux.just(ServerSentEvent.<String>builder()
                                .event("done").data("[DONE]").build()))
                .doOnComplete(() -> log.info("Chat SSE session completed (done event sent)"));
    }

    /**
     * When the request sends no tool definitions to the model, skip the blocking
     * {@link AiApiClient#chatWithTools} round and stream the assistant reply directly from the provider
     * ({@code stream: true}), matching low-latency behaviour of a plain chat completion call.
     */
    private ToolResolutionResult skipToolResolutionForDirectStreaming(List<ChatMessage> messages) {
        log.info(
                "No tool definitions for this request — skipping blocking tool-resolution completion; "
                        + "streaming assistant directly from API (messages={})",
                messages.size());
        return new ToolResolutionResult(new ArrayList<>(messages), List.of(), null, null);
    }

    /**
     * Maps a resolved tool phase (pre-generated final text or a follow-up stream) to client SSE events.
     */
    private Flux<ServerSentEvent<String>> resolvedToClientFlux(
            ToolResolutionResult resolved,
            ChatRequest request,
            List<Map<String, Object>> tools,
            String llmId,
            boolean useReasoning) {
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
            String preGen = resolved.preGeneratedContent();
            int cp = preGen.codePointCount(0, preGen.length());
            int approxEvents = cp == 0 ? 1 : (cp + PRE_GENERATED_SSE_CHUNK_CODE_POINTS - 1) / PRE_GENERATED_SSE_CHUNK_CODE_POINTS;
            log.info(
                    "Emitting pre-generated content as chunked SSE token stream ({} chars, {} codepoints, ~{} token events), skipping second API call",
                    preGen.length(),
                    cp,
                    approxEvents);
            tokenStream = tokenFluxFromPreGenerated(preGen);
        } else {
            java.util.concurrent.atomic.AtomicInteger streamChunks = new java.util.concurrent.atomic.AtomicInteger();
            java.util.concurrent.atomic.AtomicInteger streamChars = new java.util.concurrent.atomic.AtomicInteger();
            log.info(
                    "Starting assistant token stream to client: toolCallSseEvents={}, messagesForApi={}",
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
    }

    /**
     * Tool rounds with {@code stream: true} to the provider: forward {@code delta.content} as SSE tokens immediately,
     * accumulate {@code delta.tool_calls}, then run tools and continue until a text-only stop or ask_clarification.
     */
    private Flux<ServerSentEvent<String>> toolResolutionStreamingFlux(
            List<ChatMessage> initialMessages,
            List<Map<String, Object>> tools,
            String llmId,
            boolean useReasoning,
            ChatRequest request) {
        return Flux.create(
                sink -> Schedulers.boundedElastic()
                        .schedule(() -> {
                            try {
                                runStreamingToolLoop(
                                        sink, new ArrayList<>(initialMessages), tools, llmId, useReasoning, request);
                                sink.complete();
                            } catch (Throwable t) {
                                sink.error(t);
                            }
                        }),
                FluxSink.OverflowStrategy.BUFFER);
    }

    private void runStreamingToolLoop(
            FluxSink<ServerSentEvent<String>> sink,
            List<ChatMessage> currentMessages,
            List<Map<String, Object>> tools,
            String llmId,
            boolean useReasoning,
            ChatRequest request) {
        log.info(
                "Tool resolution (streaming): starting with {} messages, {} tool definitions registered",
                currentMessages.size(),
                tools != null ? tools.size() : 0);

        for (int round = 0; round < MAX_TOOL_ROUNDS; round++) {
            if (sink.isCancelled()) {
                return;
            }
            ChatCompletionStreamParser parser = new ChatCompletionStreamParser(objectMapper);
            log.trace("Received request to stream chat completion round {} with messages={}", round + 1, currentMessages.size());
            aiApiClient
                    .rawChatCompletionStreamLines(currentMessages, tools, llmId, useReasoning)
                    .doOnNext(line -> {
                        for (String frag : parser.consumeLine(line)) {
                            sink.next(ServerSentEvent.<String>builder()
                                    .event("token")
                                    .data(escapeForSse(frag))
                                    .build());
                        }
                    })
                    .blockLast(Duration.ofMinutes(15));

            String fr = parser.getFinishReason();
            List<ToolCall> toolCalls = parser.buildToolCallsOrEmpty();
            String accumulated = parser.getAccumulatedAssistantContent();

            if ("tool_calls".equals(fr) && toolCalls.isEmpty()) {
                log.error(
                        "Tool round {}: finish_reason=tool_calls but no parseable tool_calls — provider delta format may differ",
                        round + 1);
                return;
            }

            if (toolCalls.isEmpty()) {
                if ("length".equals(fr)) {
                    log.warn(
                            "Tool round {}: finish_reason=length (no tool_calls), messages={}, approxChars={}",
                            round + 1,
                            currentMessages.size(),
                            currentMessages.stream()
                                    .mapToInt(m -> m.getContent() != null ? m.getContent().length() : 0)
                                    .sum());
                } else if (accumulated == null || accumulated.isBlank()) {
                    log.warn(
                            "Tool round {}: stream ended with no content and no tool_calls — possible overflow or filter",
                            round + 1);
                } else {
                    log.info(
                            "Tool round {}: streaming finished with stop and no tool_calls ({} chars already sent as tokens)",
                            round + 1,
                            accumulated.length());
                }
                log.trace("Finished successfully streaming tool round {} (text-only)", round + 1);
                return;
            }

            log.info("Tool round {}: model requested {} tool call(s) (streaming accumulation)", round + 1, toolCalls.size());

            boolean hasClarification = toolCalls.stream()
                    .anyMatch(tc -> AskClarificationTool.TOOL_NAME.equals(tc.getFunction().getName()));
            if (hasClarification) {
                ToolCall clarCall = toolCalls.stream()
                        .filter(tc -> AskClarificationTool.TOOL_NAME.equals(tc.getFunction().getName()))
                        .findFirst()
                        .orElseThrow();
                String preGen = buildClarificationBlock(clarCall.getFunction().getArguments());
                log.info(
                        "Tool round {}: ask_clarification intercepted — emitting clarification block as chunked tokens ({} chars)",
                        round + 1,
                        preGen.length());
                tokenFluxFromPreGenerated(preGen).doOnNext(sink::next).blockLast(Duration.ofMinutes(2));
                log.trace("Finished successfully after ask_clarification in round {}", round + 1);
                return;
            }

            boolean hasGuidedThreadProposal = toolCalls.stream()
                    .anyMatch(tc -> ProposeGuidedThreadTool.TOOL_NAME.equals(tc.getFunction().getName()));
            if (hasGuidedThreadProposal) {
                if (toolCalls.size() == 1
                        && ProposeGuidedThreadTool.TOOL_NAME.equals(toolCalls.get(0).getFunction().getName())) {
                    String argsJson = toolCalls.get(0).getFunction().getArguments();
                    String preGen = buildGuidedThreadOfferBlock(argsJson);
                    int planLen = estimateSteeringPlanMarkdownLen(argsJson);
                    log.info(
                            "Tool round {}: propose_guided_thread intercepted — emitting guided_thread_offer fence (fenceChars={}, steeringPlanCharsApprox={})",
                            round + 1,
                            preGen.length(),
                            planLen);
                    log.debug("propose_guided_thread fence preview: {}", previewForLog(preGen, 800));
                    tokenFluxFromPreGenerated(preGen).doOnNext(sink::next).blockLast(Duration.ofMinutes(2));
                    log.trace("Finished successfully after propose_guided_thread in round {}", round + 1);
                    return;
                }
                log.warn(
                        "Tool round {}: propose_guided_thread combined with other tool calls — using normal tool execution",
                        round + 1);
            }

            emitToolExecutionAndHistory(sink, currentMessages, toolCalls, accumulated, round);
        }
        log.warn("Streaming tool loop stopped after {} rounds (max)", MAX_TOOL_ROUNDS);
    }

    private void emitToolExecutionAndHistory(
            FluxSink<ServerSentEvent<String>> sink,
            List<ChatMessage> currentMessages,
            List<ToolCall> toolCalls,
            String assistantStreamContent,
            int round) {
        for (ToolCall tc : toolCalls) {
            String description = toolExecutor.describeToolCall(tc);
            log.trace("Emitting tool_call SSE event for round {}: {}", round + 1, description);
            log.info("Tool call round {}: {}", round + 1, description);
            log.debug(
                    "Tool call raw: name={}, id={}, arguments preview: {}",
                    tc.getFunction().getName(),
                    tc.getId(),
                    previewForLog(tc.getFunction().getArguments(), 1200));
            sink.next(ServerSentEvent.<String>builder()
                    .event("tool_call")
                    .data(escapeForSse(description))
                    .build());
        }

        ChatMessage assistantMsg = new ChatMessage();
        assistantMsg.setRole("assistant");
        if (assistantStreamContent != null && !assistantStreamContent.isBlank()) {
            assistantMsg.setContent(assistantStreamContent);
        }
        assistantMsg.setToolCalls(toolCalls);
        currentMessages.add(assistantMsg);

        for (ToolCall tc : toolCalls) {
            log.trace("Starting execution of tool result for round {}: name={}", round + 1, tc.getFunction().getName());
            String toolResult = toolExecutor.execute(tc);
            log.trace(
                    "Finished tool execution for round {}: name={}, result length={}",
                    round + 1,
                    tc.getFunction().getName(),
                    toolResult != null ? toolResult.length() : 0);
            log.info(
                    "Tool result: name={}, id={}, {} chars, preview: {}",
                    tc.getFunction().getName(),
                    tc.getId(),
                    toolResult != null ? toolResult.length() : 0,
                    previewForLog(toolResult, 1500));
            currentMessages.add(ChatMessage.toolResult(tc.getId(), toolResult));
        }

        // Emit only this round's assistant + tool rows so the client does not duplicate prior rounds.
        int addedThisRound = 1 + toolCalls.size();
        List<ChatMessage> slice = currentMessages.subList(
                currentMessages.size() - addedThisRound,
                currentMessages.size());
        try {
            String toolHistoryJson = objectMapper.writeValueAsString(slice);
            log.debug("tool_history JSON length: {} chars (this round only, {} messages)", toolHistoryJson.length(), slice.size());
            sink.next(ServerSentEvent.<String>builder()
                    .event("tool_history")
                    .data(escapeForSse(toolHistoryJson))
                    .build());
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize tool_history messages", e);
        }
        int est = contextService.estimateTokensForMessages(currentMessages);
        sink.next(ServerSentEvent.<String>builder()
                .event("context_update")
                .data("{\"estimatedTokens\":" + est + "}")
                .build());
        log.trace("Finished emitting tool execution and history for round {}", round + 1);
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
        log.trace(
                "Received request to preview context: mode={}, referencedFiles={}",
                request.getMode(),
                request.getReferencedFiles());
        AssembledContext context = contextService.assemble(request);
        String systemPrompt = extractSystemPromptFromAssembled(context);
        log.info(
                "context-preview result: files={}, estimatedTokens={}, systemPromptChars={}",
                context.getIncludedFiles().size(),
                context.getEstimatedTokens(),
                systemPrompt.length());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("includedFiles", context.getIncludedFiles());
        body.put("estimatedTokens", context.getEstimatedTokens());
        body.put("contextBlocks", context.getContextBlocks());
        body.put("systemPrompt", systemPrompt);
        log.trace("Finished successfully preview context: systemPromptChars={}", systemPrompt.length());
        return body;
    }

    /**
     * First assembled message is always the system prompt for non–quick-chat assembly.
     */
    private static String extractSystemPromptFromAssembled(AssembledContext context) {
        List<ChatMessage> msgs = context.getMessages();
        if (msgs == null || msgs.isEmpty()) {
            return "";
        }
        ChatMessage first = msgs.get(0);
        if (first != null && first.getRole() != null && "system".equalsIgnoreCase(first.getRole())) {
            return first.getContent() != null ? first.getContent() : "";
        }
        return "";
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
     * Converts {@code propose_guided_thread} JSON arguments into a {@code guided_thread_offer} fenced block for the UI.
     */
    @SuppressWarnings("unchecked")
    private String buildGuidedThreadOfferBlock(String argsJson) {
        try {
            Map<String, Object> args = objectMapper.readValue(argsJson, Map.class);
            Object planObj = args.get("steeringPlanMarkdown");
            String plan = planObj instanceof String ? ((String) planObj).trim() : "";
            if (plan.isEmpty()) {
                log.warn("propose_guided_thread: empty steeringPlanMarkdown in args — using placeholder plan");
                plan = "*(Ungültiges Angebot: kein Arbeitsplan. Bitte erneut anfragen.)*";
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("steeringPlanMarkdown", plan);
            copyOptionalStringArg(args, payload, "threadTitle");
            copyOptionalStringArg(args, payload, "summary");
            copyOptionalStringArg(args, payload, "modeId");
            copyOptionalStringArg(args, payload, "agentPresetId");
            String json = objectMapper.writeValueAsString(payload);
            return "```guided_thread_offer\n" + json + "\n```";
        } catch (Exception e) {
            log.warn("Failed to build guided_thread_offer from args: {}", previewForLog(argsJson, 400), e);
            try {
                Map<String, Object> fallback = new LinkedHashMap<>();
                fallback.put(
                        "steeringPlanMarkdown",
                        "*(Angebotsdaten konnten nicht gelesen werden. Bitte erneut anfragen.)*");
                fallback.put("summary", "Parse error");
                return "```guided_thread_offer\n" + objectMapper.writeValueAsString(fallback) + "\n```";
            } catch (JsonProcessingException e2) {
                log.error("Failed to serialize guided_thread_offer fallback", e2);
                return "```guided_thread_offer\n{\"steeringPlanMarkdown\":\"*Error*\",\"summary\":\"Parse error\"}\n```";
            }
        }
    }

    @SuppressWarnings("unchecked")
    private int estimateSteeringPlanMarkdownLen(String argsJson) {
        if (argsJson == null || argsJson.isBlank()) {
            return 0;
        }
        try {
            Map<String, Object> args = objectMapper.readValue(argsJson, Map.class);
            Object planObj = args.get("steeringPlanMarkdown");
            if (planObj instanceof String s) {
                return s.length();
            }
        } catch (Exception ignored) {
            // ignore
        }
        return 0;
    }

    private void copyOptionalStringArg(Map<String, Object> args, Map<String, Object> payload, String key) {
        Object v = args.get(key);
        if (v instanceof String s) {
            String t = s.trim();
            if (!t.isEmpty()) {
                payload.put(key, t);
            }
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

    /**
     * Splits pre-generated assistant text into many SSE {@code token} events so the client can render incrementally.
     * Empty or null yields a single empty token so {@code tokenCount} stays consistent with the {@code done} handshake.
     */
    private Flux<ServerSentEvent<String>> tokenFluxFromPreGenerated(String text) {
        if (text == null || text.isEmpty()) {
            return Flux.just(ServerSentEvent.<String>builder()
                    .event("token")
                    .data(escapeForSse(text == null ? "" : text))
                    .build());
        }
        List<ServerSentEvent<String>> events = new ArrayList<>();
        int i = 0;
        while (i < text.length()) {
            int remainingCp = text.codePointCount(i, text.length());
            int takeCp = Math.min(PRE_GENERATED_SSE_CHUNK_CODE_POINTS, remainingCp);
            int end = text.offsetByCodePoints(i, takeCp);
            String segment = text.substring(i, end);
            events.add(ServerSentEvent.<String>builder()
                    .event("token")
                    .data(escapeForSse(segment))
                    .build());
            i = end;
        }
        return Flux.fromIterable(events);
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
