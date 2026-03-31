package com.assistant.service.tools;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Stateless tool that lets the AI propose a note to the user.
 * The tool result (JSON) is stored as a hidden tool message in the chat history,
 * so the AI remembers it across turns and the frontend can render it as a note card.
 */
@Component
public class ProposeNoteTool extends AbstractTool {

    @Override
    public String getName() {
        return "propose_note";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Propose a note to the user to capture an insight, interpretation, or important finding from the conversation. " +
                        "The user can then save it freely or attach it to a wiki entry. " +
                        "Use this when you have reached a significant conclusion that is worth preserving. " +
                        "If the note is clearly about a specific wiki entry, provide a wikiHint (e.g. 'character/shalltear').",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "title", Map.of(
                            "type", "string",
                            "description", "Short, descriptive title for the note (e.g. 'Shalltear - Programmierte Zuneigung')"
                        ),
                        "content", Map.of(
                            "type", "string",
                            "description", "The full content of the note. Markdown is supported."
                        ),
                        "wikiHint", Map.of(
                            "type", "string",
                            "description", "Optional wiki entry this note relates to, in format 'typeId/entryId' (e.g. 'character/shalltear'). Omit if not clearly applicable."
                        )
                    ),
                    "required", List.of("title", "content")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String title = extractArg(argsJson, "title");
        String content = extractArg(argsJson, "content");
        String wikiHint = extractArg(argsJson, "wikiHint");

        if (title == null || title.isBlank()) {
            return "{\"error\":\"missing title\"}";
        }
        if (content == null || content.isBlank()) {
            return "{\"error\":\"missing content\"}";
        }

        String id = UUID.randomUUID().toString();
        long createdAt = System.currentTimeMillis();

        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"id\":\"").append(escapeJson(id)).append("\",");
        sb.append("\"title\":\"").append(escapeJson(title)).append("\",");
        sb.append("\"content\":\"").append(escapeJson(content)).append("\",");
        sb.append("\"createdAt\":").append(createdAt).append(",");
        if (wikiHint != null && !wikiHint.isBlank()) {
            sb.append("\"wikiHint\":\"").append(escapeJson(wikiHint)).append("\"");
        } else {
            sb.append("\"wikiHint\":null");
        }
        sb.append("}");
        return sb.toString();
    }

    @Override
    public String describe(String argsJson) {
        String title = extractArg(argsJson, "title");
        return "Note vorschlagen: " + (title != null ? title : "...");
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
