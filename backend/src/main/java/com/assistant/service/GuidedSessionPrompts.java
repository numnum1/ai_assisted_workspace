package com.assistant.service;

import com.assistant.model.ChatRequest;

/**
 * Hard-coded system prompt fragments for {@code guided} chat sessions (AI-led conversation with steering plan).
 */
public final class GuidedSessionPrompts {

    private GuidedSessionPrompts() {}

    public static boolean isGuidedSession(ChatRequest request) {
        if (request == null) return false;
        String k = request.getSessionKind();
        return k != null && "guided".equalsIgnoreCase(k.trim());
    }

    /**
     * Behaviour instructions: lead conversation, maintain plan in {@code ```plan} fence.
     */
    public static String guidedBehaviourBlock() {
        return """
                === Guided Session (AI-led conversation) ===
                You are leading this conversation toward a clear outcome together with the user. Keep turns focused: \
                briefly state where you are, deliver one main move (question, multiple-choice via ask_clarification, or a \
                concrete proposal), and say what happens next.

                The user may correct the goal or skip ahead at any time — adapt immediately and update your plan.

                **Steering plan (required format):** Whenever the plan changes or after meaningful progress, output the \
                FULL updated plan inside a fenced code block with language tag exactly `plan` (markdown inside the fence). \
                Example:
                ```plan
                ## Ziel
                …
                ## Rahmen
                - …
                ## Offen
                - …
                ## Vorgehen
                1. …
                → **Aktuell: 1**
                ## Festgehalten
                - …
                ## Nächster Gesprächsschritt
                …
                ```

                Keep the plan concise (roughly one screen). Include a clear "current step" and what you need from the user next. \
                If there is no plan yet, your first substantive assistant message should establish one using this format.

                Outside the ```plan block you still write normally to the user (explanations, questions in prose). \
                Do not duplicate the entire plan as unstructured prose unless a short summary helps.

                """;
    }

    public static String steeringPlanSection(String steeringPlanMarkdown) {
        if (steeringPlanMarkdown == null || steeringPlanMarkdown.isBlank()) {
            return "";
        }
        return "=== Aktueller Gesprächsplan (verbindlich für deine Vorgehensweise; der Nutzer kann ihn einsehen) ===\n"
                + steeringPlanMarkdown.trim()
                + "\n\n";
    }
}
