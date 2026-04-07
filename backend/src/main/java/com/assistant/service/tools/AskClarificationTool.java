package com.assistant.service.tools;

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
                    "Ask the user one or more clarification questions before proceeding with a task. " +
                    "Use this tool when the user's request is genuinely ambiguous and a wrong assumption " +
                    "would lead to a significantly wrong or wasted answer. " +
                    "Do NOT use it for simple tasks where a reasonable assumption can be made. " +
                    "Call this tool INSTEAD of writing any response text — the questions will be " +
                    "shown as a form and the user's answers will be sent back to you.",
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
        return "Rückfrage stellen";
    }
}
