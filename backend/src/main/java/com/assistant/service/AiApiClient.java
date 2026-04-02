package com.assistant.service;

import com.assistant.model.ChatMessage;
import com.assistant.model.ResolvedAiCredentials;
import com.assistant.model.ToolCall;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.util.*;

@Service
public class AiApiClient {

    private static final Logger log = LoggerFactory.getLogger(AiApiClient.class);

    private static final int MAX_IN_MEMORY = 16 * 1024 * 1024;

    private final WebClient.Builder webClientBuilder;
    private final AiProviderService aiProviderService;

    public AiApiClient(WebClient.Builder webClientBuilder, AiProviderService aiProviderService) {
        this.webClientBuilder = webClientBuilder;
        this.aiProviderService = aiProviderService;
    }

    private WebClient clientFor(ResolvedAiCredentials cred) {
        return webClientBuilder.clone()
                .baseUrl(cred.apiUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + cred.apiKey())
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(MAX_IN_MEMORY))
                .build();
    }

    /**
     * Streams chat completions as text chunks from the OpenAI-compatible API.
     */
    public Flux<String> streamChat(List<ChatMessage> messages) {
        return streamChat(messages, null, false);
    }

    /**
     * Streams chat completions with optional tool definitions.
     */
    public Flux<String> streamChat(List<ChatMessage> messages, List<Map<String, Object>> tools) {
        return streamChat(messages, tools, false);
    }

    /**
     * Streams chat completions with optional tool definitions and reasoning model selection.
     *
     * @param useReasoning when true the provider's reasoning model is used instead of the fast model
     */
    public Flux<String> streamChat(List<ChatMessage> messages, List<Map<String, Object>> tools, boolean useReasoning) {
        return streamChat(messages, tools, (String) null, useReasoning);
    }

    /** Streams chat completions with a specific LLM entry and reasoning selection. */
    public Flux<String> streamChat(List<ChatMessage> messages, List<Map<String, Object>> tools,
                                   String llmId, boolean useReasoning) {
        ResolvedAiCredentials cred = aiProviderService.getResolved(llmId, useReasoning);
        Map<String, Object> requestBody = buildRequestBody(messages, tools, true, cred.model());

        log.info(
                "AI API stream: baseUrl={}, model={}, messages={}, tools={}, totalApproxChars={}",
                cred.apiUrl(),
                cred.model(),
                messages.size(),
                tools != null ? tools.size() : 0,
                countApproxCharsInMessages(messages));

        java.util.concurrent.atomic.AtomicInteger failedChunks = new java.util.concurrent.atomic.AtomicInteger();
        return clientFor(cred).post()
                .uri("/v1/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(requestBody)
                .retrieve()
                .onStatus(status -> status.isError(), resp ->
                        resp.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(body -> new RuntimeException(
                                        "AI API error " + resp.statusCode().value() + ": " + body)))
                .bodyToFlux(String.class)
                .filter(line -> !line.isBlank() && !line.equals("[DONE]"))
                .doOnNext(line -> {
                    if (line.contains("\"finish_reason\"") && line.contains("\"length\"")) {
                        log.warn(
                                "AI stream: finish_reason=length detected — context window likely exceeded! "
                                        + "messages={}, approxChars={}",
                                messages.size(),
                                countApproxCharsInMessages(messages));
                    }
                })
                .mapNotNull(line -> {
                    String result = extractContent(line);
                    if (result == null && !line.contains("[DONE]")) {
                        int failed = failedChunks.incrementAndGet();
                        if (failed == 1 || failed % 20 == 0) {
                            log.debug("AI stream: extractContent returned null for chunk #{}, linePreview={}",
                                    failed,
                                    line.length() > 120 ? line.substring(0, 120) + "…" : line);
                        }
                    }
                    return result;
                })
                .doOnComplete(() -> {
                    int failed = failedChunks.get();
                    if (failed > 0) {
                        log.debug("AI stream complete: {} chunk(s) had no extractable content (tool-call deltas or metadata lines)", failed);
                    }
                });
    }

    /**
     * Non-streaming chat completion that may return tool calls.
     * Returns a ChatCompletionResult which contains either content or tool calls.
     */
    public ChatCompletionResult chatWithTools(List<ChatMessage> messages, List<Map<String, Object>> tools) {
        return chatWithTools(messages, tools, false);
    }

    /**
     * Non-streaming chat completion with reasoning model selection.
     */
    public ChatCompletionResult chatWithTools(List<ChatMessage> messages, List<Map<String, Object>> tools,
                                              boolean useReasoning) {
        return chatWithTools(messages, tools, null, useReasoning);
    }

    /** Non-streaming chat completion with a specific LLM entry and reasoning selection. */
    public ChatCompletionResult chatWithTools(List<ChatMessage> messages, List<Map<String, Object>> tools,
                                              String llmId, boolean useReasoning) {
        ResolvedAiCredentials cred = aiProviderService.getResolved(llmId, useReasoning);
        Map<String, Object> requestBody = buildRequestBody(messages, tools, false, cred.model());

        log.info(
                "AI API completion (tools): baseUrl={}, model={}, messages={}, tools={}, stream=false, totalApproxChars={}",
                cred.apiUrl(),
                cred.model(),
                messages.size(),
                tools != null ? tools.size() : 0,
                countApproxCharsInMessages(messages));

        String responseBody = clientFor(cred).post()
                .uri("/v1/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(requestBody)
                .retrieve()
                .onStatus(status -> status.isError(), resp ->
                        resp.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(body -> new RuntimeException(
                                        "AI API error " + resp.statusCode().value() + ": " + body)))
                .bodyToMono(String.class)
                .block();

        if (responseBody == null) {
            log.warn("AI API chatWithTools: responseBody is null — API returned no body (possible network issue or empty 204)");
            return new ChatCompletionResult("", List.of());
        }
        log.debug("AI API completion raw response length: {} chars", responseBody.length());

        String finishReason = extractFinishReason(responseBody);
        if (finishReason != null) {
            if ("length".equals(finishReason)) {
                log.warn(
                        "AI API completion: finish_reason=length — context window likely exceeded! "
                                + "messages={}, approxChars={}. Consider shortening the chat history.",
                        messages.size(),
                        countApproxCharsInMessages(messages));
            } else if (!"stop".equals(finishReason) && !"tool_calls".equals(finishReason)) {
                log.warn("AI API completion: finish_reason={} (unexpected)", finishReason);
            } else {
                log.debug("AI API completion: finish_reason={}", finishReason);
            }
        }

        ChatCompletionResult parsed = parseCompletionResult(responseBody);
        if (parsed.hasToolCalls()) {
            log.info("AI API completion: {} tool call(s) in response", parsed.toolCalls().size());
        } else {
            String c = parsed.content();
            if (c == null || c.isBlank()) {
                log.warn(
                        "AI API completion: empty content and no tool_calls — possible context overflow or content filter. "
                                + "finish_reason={}, rawResponsePreview={}",
                        finishReason,
                        responseBody.length() > 500 ? responseBody.substring(0, 500) + "…" : responseBody);
            } else {
                log.info("AI API completion: text reply, {} chars", c.length());
            }
        }
        return parsed;
    }

    /**
     * Non-streaming chat completion.
     */
    public String chat(List<ChatMessage> messages) {
        ChatCompletionResult result = chatWithTools(messages, null, false);
        return result.content() != null ? result.content() : "";
    }

    /**
     * Non-streaming chat completion with optional LLM id (from providers list) and reasoning toggle.
     */
    public String chat(List<ChatMessage> messages, String llmId, boolean useReasoning) {
        ChatCompletionResult result = chatWithTools(messages, null, llmId, useReasoning);
        return result.content() != null ? result.content() : "";
    }

    private static int countApproxCharsInMessages(List<ChatMessage> messages) {
        int n = 0;
        for (ChatMessage m : messages) {
            if (m.getContent() != null) {
                n += m.getContent().length();
            }
            if (m.getToolCalls() != null) {
                for (ToolCall tc : m.getToolCalls()) {
                    if (tc.getFunction() != null) {
                        if (tc.getFunction().getName() != null) {
                            n += tc.getFunction().getName().length();
                        }
                        if (tc.getFunction().getArguments() != null) {
                            n += tc.getFunction().getArguments().length();
                        }
                    }
                }
            }
        }
        return n;
    }

    private Map<String, Object> buildRequestBody(List<ChatMessage> messages,
                                                  List<Map<String, Object>> tools,
                                                  boolean stream,
                                                  String model) {
        List<Map<String, Object>> apiMessages = messages.stream()
                .map(ChatMessage::toApiMap)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", apiMessages);
        body.put("stream", stream);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }
        return body;
    }

    /**
     * Parses a non-streaming response that may contain either content or tool_calls.
     */
    private ChatCompletionResult parseCompletionResult(String json) {
        if (json == null) return new ChatCompletionResult("", List.of());

        try {
            // Check for tool_calls first
            List<ToolCall> toolCalls = extractToolCalls(json);
            if (!toolCalls.isEmpty()) {
                return new ChatCompletionResult(null, toolCalls);
            }

            String content = extractNonStreamContent(json);
            return new ChatCompletionResult(content, List.of());
        } catch (Exception e) {
            log.error(
                    "Error parsing completion result — rawPreview={}",
                    json.length() > 500 ? json.substring(0, 500) + "…" : json,
                    e);
            return new ChatCompletionResult("", List.of());
        }
    }

    /**
     * Extracts the finish_reason from a non-streaming completion response.
     * Returns null if not found.
     */
    private String extractFinishReason(String json) {
        if (json == null) return null;
        try {
            String key = "\"finish_reason\"";
            int idx = json.indexOf(key);
            if (idx == -1) return null;
            int colonIdx = json.indexOf(':', idx + key.length());
            if (colonIdx == -1) return null;
            int afterColon = colonIdx + 1;
            while (afterColon < json.length() && json.charAt(afterColon) == ' ') afterColon++;
            if (afterColon >= json.length()) return null;
            if (json.charAt(afterColon) == '"') {
                int endQuote = findClosingQuote(json, afterColon + 1);
                if (endQuote == -1) return null;
                return json.substring(afterColon + 1, endQuote);
            }
            // null literal
            if (json.startsWith("null", afterColon)) return "null";
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extracts tool_calls from a non-streaming JSON response.
     * Handles the format: "tool_calls": [{"id":"...", "type":"function", "function":{"name":"...", "arguments":"..."}}]
     */
    private List<ToolCall> extractToolCalls(String json) {
        List<ToolCall> result = new ArrayList<>();
        String marker = "\"tool_calls\"";
        int tcIdx = json.indexOf(marker);
        if (tcIdx == -1) return result;

        int arrStart = json.indexOf('[', tcIdx);
        if (arrStart == -1) return result;

        int arrEnd = findMatchingBracket(json, arrStart);
        if (arrEnd == -1) return result;

        String arrContent = json.substring(arrStart, arrEnd + 1);
        int searchFrom = 0;
        while (true) {
            int objStart = arrContent.indexOf('{', searchFrom);
            if (objStart == -1) break;

            int objEnd = findMatchingBrace(arrContent, objStart);
            if (objEnd == -1) break;

            String obj = arrContent.substring(objStart, objEnd + 1);
            ToolCall tc = parseToolCallObject(obj);
            if (tc != null) {
                result.add(tc);
            }

            searchFrom = objEnd + 1;
        }

        return result;
    }

    private ToolCall parseToolCallObject(String obj) {
        try {
            String id = extractStringField(obj, "id");
            if (id == null) return null;

            int fnIdx = obj.indexOf("\"function\"");
            if (fnIdx == -1) return null;

            int fnObjStart = obj.indexOf('{', fnIdx);
            if (fnObjStart == -1) return null;

            int fnObjEnd = findMatchingBrace(obj, fnObjStart);
            if (fnObjEnd == -1) return null;

            String fnObj = obj.substring(fnObjStart, fnObjEnd + 1);
            String name = extractStringField(fnObj, "name");
            String arguments = extractStringField(fnObj, "arguments");

            if (name == null) return null;
            return new ToolCall(id, name, arguments != null ? arguments : "{}");
        } catch (Exception e) {
            return null;
        }
    }

    private String extractStringField(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx == -1) return null;
        int colonIdx = json.indexOf(':', idx + key.length());
        if (colonIdx == -1) return null;
        int startQuote = json.indexOf('"', colonIdx + 1);
        if (startQuote == -1) return null;
        int endQuote = findClosingQuote(json, startQuote + 1);
        if (endQuote == -1) return null;
        return unescapeJson(json.substring(startQuote + 1, endQuote));
    }

    private int findMatchingBracket(String s, int openIdx) {
        int depth = 0;
        boolean inString = false;
        for (int i = openIdx; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && inString) { i++; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '[') depth++;
            else if (c == ']') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    private int findMatchingBrace(String s, int openIdx) {
        int depth = 0;
        boolean inString = false;
        for (int i = openIdx; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && inString) { i++; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    private String extractContent(String sseData) {
        try {
            String data = sseData;
            if (data.startsWith("data: ")) {
                data = data.substring(6);
            }
            if (data.equals("[DONE]") || data.isBlank()) {
                return null;
            }
            int deltaIdx = data.indexOf("\"delta\"");
            if (deltaIdx == -1) return null;
            int contentIdx = data.indexOf("\"content\"", deltaIdx);
            if (contentIdx == -1) return null;
            int colonIdx = data.indexOf(":", contentIdx);
            if (colonIdx == -1) return null;
            // Skip whitespace after colon and verify the value is a string (starts with ")
            int afterColon = colonIdx + 1;
            while (afterColon < data.length() && data.charAt(afterColon) == ' ') afterColon++;
            if (afterColon >= data.length() || data.charAt(afterColon) != '"') return null;
            int startQuote = afterColon;
            int endQuote = findClosingQuote(data, startQuote + 1);
            if (endQuote == -1) return null;
            return unescapeJson(data.substring(startQuote + 1, endQuote));
        } catch (Exception e) {
            return null;
        }
    }

    private String extractNonStreamContent(String json) {
        if (json == null) return "";
        try {
            int contentIdx = json.indexOf("\"content\"");
            if (contentIdx == -1) return "";
            int colonIdx = json.indexOf(":", contentIdx);
            if (colonIdx == -1) return "";
            // Skip whitespace after colon and verify the value is a string (starts with ")
            int afterColon = colonIdx + 1;
            while (afterColon < json.length() && json.charAt(afterColon) == ' ') afterColon++;
            if (afterColon >= json.length() || json.charAt(afterColon) != '"') return "";
            int startQuote = afterColon;
            int endQuote = findClosingQuote(json, startQuote + 1);
            if (startQuote == -1 || endQuote == -1) return "";
            return unescapeJson(json.substring(startQuote + 1, endQuote));
        } catch (Exception e) {
            return "";
        }
    }

    private int findClosingQuote(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (s.charAt(i) == '\\') {
                i++;
            } else if (s.charAt(i) == '"') {
                return i;
            }
        }
        return -1;
    }

    private String unescapeJson(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char next = s.charAt(i + 1);
                switch (next) {
                    case '"'  -> { sb.append('"');  i += 2; }
                    case '\\' -> { sb.append('\\'); i += 2; }
                    case '/'  -> { sb.append('/');  i += 2; }
                    case 'n'  -> { sb.append('\n'); i += 2; }
                    case 'r'  -> { sb.append('\r'); i += 2; }
                    case 't'  -> { sb.append('\t'); i += 2; }
                    case 'b'  -> { sb.append('\b'); i += 2; }
                    case 'f'  -> { sb.append('\f'); i += 2; }
                    case 'u'  -> {
                        if (i + 5 < s.length()) {
                            try {
                                int codePoint = Integer.parseInt(s.substring(i + 2, i + 6), 16);
                                sb.appendCodePoint(codePoint);
                                i += 6;
                            } catch (NumberFormatException e) {
                                sb.append(c);
                                i++;
                            }
                        } else {
                            sb.append(c);
                            i++;
                        }
                    }
                    default -> { sb.append(c); i++; }
                }
            } else {
                sb.append(c);
                i++;
            }
        }
        return sb.toString();
    }

    public record ChatCompletionResult(String content, List<ToolCall> toolCalls) {
        public boolean hasToolCalls() {
            return toolCalls != null && !toolCalls.isEmpty();
        }
    }
}
