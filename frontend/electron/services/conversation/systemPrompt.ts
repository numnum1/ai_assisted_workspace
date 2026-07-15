export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const TOOLKIT_TOOL_DEFINITIONS: Record<string, ToolDefinition[]> = {
  assistant: [
    {
      type: "function",
      function: {
        name: "ask_clarification",
        description:
          "Ask the user one or more clarifying questions before proceeding. " +
          "Set allow_multiple: true on a question to let the user select multiple options at once (e.g. 'which of these do you use?' where several may apply).",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  allow_multiple: {
                    type: "boolean",
                    description:
                      "If true, the user may select multiple options. Use when several answers can apply simultaneously (e.g. which channels does the user use).",
                  },
                },
                required: ["question", "options"],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "ask_yes_no",
        description:
          "MANDATORY: Call this tool whenever you want to ask the user any yes/no question. " +
          "NEVER ask a yes/no question as plain text — ALWAYS use this tool instead. " +
          "The app renders two buttons (Ja / Nein) for the user to click. " +
          "Only use this for decisions with exactly two options (yes or no). " +
          "For questions with more than two options, use ask_clarification instead.",
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The yes/no question to display to the user.",
            },
          },
          required: ["question"],
        },
      },
    },
  ],
};
