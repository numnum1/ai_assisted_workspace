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
        ResolvedAiCredentials cred = aiProviderService.getActiveResolved(useReasoning);
        Map<String, Object> requestBody = buildRequestBody(messages, tools, true, cred.model());

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
                .mapNotNull(this::extractContent);
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
        ResolvedAiCredentials cred = aiProviderService.getActiveResolved(useReasoning);
        Map<String, Object> requestBody = buildRequestBody(messages, tools, false, cred.model());

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

        return parseCompletionResult(responseBody);
    }

    /**
     * Non-streaming chat completion.
     */
    public String chat(List<ChatMessage> messages) {
        ChatCompletionResult result = chatWithTools(messages, null, false);
        return result.content() != null ? result.content() : "";
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
            log.error("Error parsing completion result", e);
            return new ChatCompletionResult("", List.of());
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
        return s.replace("\\n", "\n")
                .replace("\\t", "\t")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    public record ChatCompletionResult(String content, List<ToolCall> toolCalls) {
        public boolean hasToolCalls() {
            return toolCalls != null && !toolCalls.isEmpty();
        }
    }
}
