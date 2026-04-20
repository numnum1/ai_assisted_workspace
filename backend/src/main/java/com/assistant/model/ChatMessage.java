package com.assistant.model;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
public class ChatMessage {

    private String role;
    private String content;
    private List<ToolCall> toolCalls;
    private String toolCallId;

    public ChatMessage(String role, String content) {
        this.role = role;
        this.content = content;
    }

    public static ChatMessage assistantWithToolCalls(List<ToolCall> toolCalls) {
        ChatMessage msg = new ChatMessage();
        msg.setRole("assistant");
        msg.setToolCalls(toolCalls);
        return msg;
    }

    public static ChatMessage toolResult(String toolCallId, String content) {
        ChatMessage msg = new ChatMessage("tool", content);
        msg.setToolCallId(toolCallId);
        return msg;
    }

    /**
     * Converts this message to the Map format expected by the OpenAI API,
     * handling tool_calls and tool_call_id fields correctly.
     */
    public Map<String, Object> toApiMap() {
        if ("assistant".equals(role) && toolCalls != null && !toolCalls.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("role", role);
            if (content != null && !content.isBlank()) {
                out.put("content", content);
            }
            out.put(
                    "tool_calls",
                    toolCalls.stream()
                            .map(
                                    tc -> Map.of(
                                            "id", tc.getId(),
                                            "type", tc.getType(),
                                            "function",
                                            Map.of(
                                                    "name", tc.getFunction().getName(),
                                                    "arguments", tc.getFunction().getArguments())))
                            .toList());
            return out;
        }
        if ("tool".equals(role) && toolCallId != null) {
            return Map.of(
                "role", role,
                "tool_call_id", toolCallId,
                "content", content != null ? content : ""
            );
        }
        return Map.of("role", role, "content", content != null ? content : "");
    }
}
