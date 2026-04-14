package com.assistant.service;

import com.assistant.model.ToolCall;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Parses one OpenAI-style streaming chat completion round (SSE {@code data:} lines).
 * Accumulates {@code delta.content} and {@code delta.tool_calls} until {@code finish_reason} is set.
 */
public final class ChatCompletionStreamParser {

    private final ObjectMapper objectMapper;
    private final StringBuilder assistantContent = new StringBuilder();
    private final Map<Integer, ToolCallSlot> toolSlots = new TreeMap<>();
    private String finishReason;

    public ChatCompletionStreamParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * @return content deltas to forward to the client (in order); never null (may be empty)
     */
    public List<String> consumeLine(String rawLine) {
        List<String> contentDeltas = new ArrayList<>();
        String line = rawLine == null ? "" : rawLine.trim();
        if (line.isEmpty()) {
            return contentDeltas;
        }
        if (line.startsWith("data:")) {
            line = line.substring(5).trim();
        }
        if (line.isEmpty() || "[DONE]".equals(line)) {
            return contentDeltas;
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(line);
        } catch (Exception e) {
            return contentDeltas;
        }
        JsonNode choices = root.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            return contentDeltas;
        }
        JsonNode choice0 = choices.get(0);
        JsonNode delta = choice0.path("delta");
        if (delta.has("content") && delta.get("content").isTextual()) {
            String piece = delta.get("content").asText();
            if (!piece.isEmpty()) {
                assistantContent.append(piece);
                contentDeltas.add(piece);
            }
        }
        JsonNode toolCalls = delta.path("tool_calls");
        if (toolCalls.isArray()) {
            for (JsonNode tcNode : toolCalls) {
                int index = tcNode.has("index") ? tcNode.get("index").asInt(0) : 0;
                ToolCallSlot slot = toolSlots.computeIfAbsent(index, k -> new ToolCallSlot());
                if (tcNode.has("id") && tcNode.get("id").isTextual()) {
                    String id = tcNode.get("id").asText();
                    if (!id.isEmpty()) {
                        slot.id = id;
                    }
                }
                JsonNode fn = tcNode.path("function");
                if (fn.has("name") && fn.get("name").isTextual()) {
                    slot.name.append(fn.get("name").asText());
                }
                if (fn.has("arguments")) {
                    JsonNode argsNode = fn.get("arguments");
                    if (argsNode.isTextual()) {
                        slot.arguments.append(argsNode.asText());
                    }
                }
            }
        }
        JsonNode fr = choice0.get("finish_reason");
        if (fr != null && !fr.isNull() && fr.isTextual()) {
            String v = fr.asText();
            if (v != null && !v.isEmpty() && !"null".equals(v)) {
                this.finishReason = v;
            }
        }
        return contentDeltas;
    }

    public String getFinishReason() {
        return finishReason;
    }

    public String getAccumulatedAssistantContent() {
        return assistantContent.toString();
    }

    /**
     * Builds the final tool list after the HTTP stream ended. Call after all {@link #consumeLine} calls.
     */
    public List<ToolCall> buildToolCallsOrEmpty() {
        List<ToolCall> out = new ArrayList<>();
        for (Map.Entry<Integer, ToolCallSlot> e : toolSlots.entrySet()) {
            ToolCallSlot s = e.getValue();
            String name = s.name.toString();
            if (name.isEmpty()) {
                continue;
            }
            String id = s.id != null && !s.id.isEmpty() ? s.id : "call_stream_" + e.getKey();
            String args = s.arguments.toString();
            out.add(new ToolCall(id, name, args.isEmpty() ? "{}" : args));
        }
        return out;
    }

    public boolean hasToolCallAccumulation() {
        for (ToolCallSlot s : toolSlots.values()) {
            if (s.name.length() > 0) {
                return true;
            }
        }
        return false;
    }

    private static final class ToolCallSlot {
        String id;
        final StringBuilder name = new StringBuilder();
        final StringBuilder arguments = new StringBuilder();
    }
}
