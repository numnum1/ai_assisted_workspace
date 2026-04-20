package com.assistant.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * AI tool that asks the user one or more clarification questions before answering.
 * The actual execution is intercepted in {@code ChatController.resolveToolCalls} —
 * the questions are converted into a {@code clarification} fenced block and returned
 * as pre-generated content instead of making a second LLM call.
 * This {@code execute()} method therefore should never be called in normal flow.
 */
@Component
public class AskClarificationTool extends AbstractTool {

    public static final String TOOL_NAME = "ask_clarification";

    private static final Logger log = LoggerFactory.getLogger(AskClarificationTool.class);

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", TOOL_NAME,
                "description",
                    "Ask the user one or more clarification questions before proceeding. " +
                    "Whenever you would present two or more fixed alternatives (multiple choice: topics, priorities, formats, design options, etc.), " +
                    "you MUST use this tool — do not list options as markdown or plain text in the assistant message. " +
                    "In non-guided chat, use when ambiguity would cause a wrong answer, or when a discrete choice is the clearest way to proceed. " +
                    "In guided sessions, also use for scoping (which problem area or focus next) and when the task involves design, modeling, class/API structure, " +
                    "or domain boundaries and the user left important representation choices open: ask before finalizing a concrete schema or code; " +
                    "include an \"Egal / du entscheidest\" (or similar) option when helpful. " +
                    "In guided mode, do not use this to stall when the steering plan already defines the next concrete step. " +
                    "Call this tool as your ONLY action (no other assistant message text); the user answers in the next turn. " +
                    "In guided sessions, after answers, follow up with an updated fenced `plan` block (unless that turn was clarification-only per guided instructions).",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "questions", Map.of(
                            "type", "array",
                            "description", "One or more questions to ask the user.",
                            "items", Map.of(
                                "type", "object",
                                "properties", Map.of(
                                    "question", Map.of(
                                        "type", "string",
                                        "description", "The question text"
                                    ),
                                    "options", Map.of(
                                        "type", "array",
                                        "description", "2–5 short answer options",
                                        "items", Map.of("type", "string")
                                    ),
                                    "allow_multiple", Map.of(
                                        "type", "boolean",
                                        "description", "Set to true if the user may select more than one option"
                                    )
                                ),
                                "required", List.of("question", "options")
                            )
                        )
                    ),
                    "required", List.of("questions")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        log.warn("ask_clarification execute() called unexpectedly — should have been intercepted in ChatController. argsJson preview: {}",
                argsJson != null ? argsJson.substring(0, Math.min(200, argsJson.length())) : "null");
        return "";
    }

    @Override
    public String describe(String argsJson) {
        log.trace("Generating description for ask_clarification with args: {}", argsJson);
        return "Rückfrage an den Nutzer stellen";
    }
}
