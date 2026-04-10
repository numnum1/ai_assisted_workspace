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
     * Behaviour instructions: lead conversation, proactively drive the steering plan to completion.
     * The AI must advance concrete steps, make decisions, and declare completion when goals are met.
     */
    public static String guidedBehaviourBlock() {
        return """
                === Guided Session (AI-led conversation with binding steering plan) ===
                You are the proactive driver of this conversation. Your primary goal is to execute the current steering plan, \
                make concrete progress on each step, take decisions where needed, and bring the session to a successful close.

                Rules for every turn:
                - Advance the CURRENT step in the plan. Do not ask the user "what next" or what they want to discuss.
                - Deliver one main forward move: a concrete proposal, analysis, decision, written output, or targeted clarification.
                - After meaningful progress ALWAYS output the FULL updated steering plan in a fenced ```plan block.
                - When all goals in the plan are completed or the outcome is achieved, explicitly state "Der Plan ist abgeschlossen" \
                  and include a final ```plan block with ## Status: Abgeschlossen. Do not continue asking questions after completion.

                The user may correct the goal or skip ahead — adapt the plan immediately.

                **Steering plan (required format):** Output the FULL updated plan after every meaningful step or decision. \
                Use exactly this structure inside a fenced code block with language tag `plan`:

                ```plan
                ## Ziel
                [Klarer Outcome]

                ## Rahmen
                - [Constraints, Scope]

                ## Status
                - Aktueller Fortschritt: [what has been done]
                - Entscheidungen getroffen: [list key decisions]
                - Offene Punkte: [remaining]

                ## Vorgehen
                1. [Step description] → **Aktuell: 1**  (mark the active step clearly)
                2. [Next step]

                ## Nächster Schritt
                [What you will do now or what you need from the user to unblock the current step. Be specific.]

                ## Abschlusskriterien
                [Clear measurable criteria that indicate the plan is complete]
                ```

                Keep the plan concise (one screen). Always maintain a clear "Aktuell:" marker. \
                If there is no plan yet, your first substantive message must create one. \
                The dedicated "Arbeitsplan" panel shows the latest ```plan — never repeat the full plan as prose in the chat.

                Outside the ```plan block write normally to the user (explanations, proposals, summaries). \
                Use ask_clarification only when a specific decision or step is truly blocked and cannot reasonably be advanced.

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
