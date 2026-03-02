package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.ChatMessage;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

@Service
public class AiApiClient {

    private final WebClient webClient;
    private final AppConfig appConfig;

    public AiApiClient(WebClient aiWebClient, AppConfig appConfig) {
        this.webClient = aiWebClient;
        this.appConfig = appConfig;
    }

    /**
     * Streams chat completions as text chunks from the OpenAI-compatible API.
     */
    public Flux<String> streamChat(List<ChatMessage> messages) {
        List<Map<String, String>> apiMessages = messages.stream()
                .map(m -> Map.of("role", m.getRole(), "content", m.getContent()))
                .toList();

        Map<String, Object> requestBody = Map.of(
                "model", appConfig.getAi().getModel(),
                "messages", apiMessages,
                "stream", true
        );

        return webClient.post()
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
     * Non-streaming chat completion.
     */
    public String chat(List<ChatMessage> messages) {
        List<Map<String, String>> apiMessages = messages.stream()
                .map(m -> Map.of("role", m.getRole(), "content", m.getContent()))
                .toList();

        Map<String, Object> requestBody = Map.of(
                "model", appConfig.getAi().getModel(),
                "messages", apiMessages,
                "stream", false
        );

        String responseBody = webClient.post()
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

        return extractNonStreamContent(responseBody);
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
            // Simple JSON parsing for the delta content field
            int deltaIdx = data.indexOf("\"delta\"");
            if (deltaIdx == -1) return null;
            int contentIdx = data.indexOf("\"content\"", deltaIdx);
            if (contentIdx == -1) return null;
            int colonIdx = data.indexOf(":", contentIdx);
            if (colonIdx == -1) return null;
            // Find the opening quote of the value
            int startQuote = data.indexOf("\"", colonIdx + 1);
            if (startQuote == -1) return null;
            // Find the closing quote, handling escaped quotes
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
            int startQuote = json.indexOf("\"", colonIdx + 1);
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
                i++; // skip escaped character
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
}
