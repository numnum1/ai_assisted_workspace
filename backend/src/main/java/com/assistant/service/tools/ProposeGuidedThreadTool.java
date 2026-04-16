package com.assistant.service.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * AI tool that offers the user a new guided chat thread with a prepared steering plan.
 * Normal execution is intercepted in {@link com.assistant.controller.ChatController}; the
 * controller emits a {@code guided_thread_offer} fenced block instead of running the tool loop.
 */
@Component
public class ProposeGuidedThreadTool extends AbstractTool {

    public static final String TOOL_NAME = "propose_guided_thread";

    private static final Logger log = LoggerFactory.getLogger(ProposeGuidedThreadTool.class);

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
                        "Offer the user a **new guided chat thread** (AI-led session with a binding steering plan) branched from this conversation. "
                                + "Use when a clearly scoped, multi-step workflow would work better as its own guided session with a fresh plan — "
                                + "not for quick one-off answers. "
                                + "Provide a complete initial steering plan in `steeringPlanMarkdown` (German headings like ## Ziel, ## Rahmen, ## Status, ## Vorgehen, ## Nächster Schritt, ## Abschlusskriterien work well). "
                                + "Call this tool as your **ONLY** action in the turn: no other assistant message text before or after the tool call.",
                        "parameters", Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "steeringPlanMarkdown", Map.of(
                                                "type", "string",
                                                "description", "Full markdown body of the initial steering plan for the new guided thread."
                                        ),
                                        "threadTitle", Map.of(
                                                "type", "string",
                                                "description", "Optional short title for the new thread (shown in history)."
                                        ),
                                        "summary", Map.of(
                                                "type", "string",
                                                "description", "Optional one-line summary for the offer card."
                                        ),
                                        "modeId", Map.of(
                                                "type", "string",
                                                "description", "Optional chat mode id to use in the new thread (must exist in the project)."
                                        ),
                                        "agentPresetId", Map.of(
                                                "type", "string",
                                                "description", "Optional project agent preset id (.assistant/agents.json) to apply LLM/tool defaults."
                                        )
                                ),
                                "required", List.of("steeringPlanMarkdown")
                        )
                )
        );
    }

    @Override
    public String execute(String argsJson) {
        log.warn(
                "propose_guided_thread execute() called unexpectedly — should be intercepted in ChatController. args preview: {}",
                argsJson != null ? argsJson.substring(0, Math.min(200, argsJson.length())) : "null");
        return "Error: propose_guided_thread was not handled by the server.";
    }

    @Override
    public String describe(String argsJson) {
        String title = extractArg(argsJson, "threadTitle");
        if (title != null && !title.isBlank()) {
            return "Guided-Thread anbieten: " + title.trim();
        }
        return "Guided-Thread mit Arbeitsplan anbieten";
    }
}
