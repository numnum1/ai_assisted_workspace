import { normalizeText } from "./conversation/projectContext.js";
import { safeJsonParse } from "./openAiClient.js";
import type { ToolCall } from "../../src/types.js";

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  description: string;
  result: string;
}

export function buildClarificationFence(
  questions: unknown,
): { text: string; normalizedQuestions: unknown[] } | null {
  const normalizedQuestions = Array.isArray(questions)
    ? questions.filter(
        (q) =>
          q &&
          typeof q === "object" &&
          typeof (q as { question?: unknown }).question === "string" &&
          Array.isArray((q as { options?: unknown }).options),
      )
    : questions &&
        typeof questions === "object" &&
        typeof (questions as { question?: unknown }).question === "string" &&
        Array.isArray((questions as { options?: unknown }).options)
      ? [questions]
      : [];

  if (normalizedQuestions.length === 0) return null;

  return {
    text: `\`\`\`clarification\n${JSON.stringify(normalizedQuestions, null, 2)}\n\`\`\``,
    normalizedQuestions,
  };
}

export function buildYesNoFence(question: string): string {
  return `\`\`\`yes_no\n${JSON.stringify({ question })}\n\`\`\``;
}

export function describeStreamingToolCall(toolCall: ToolCall): string {
  const name = toolCall.function.name;
  if (name === "ask_clarification") return "Stelle Rückfrage";
  if (name === "ask_yes_no") return "Ja/Nein-Frage";
  return `Tool: ${name}`;
}

export async function executeToolCall(
  toolCall: ToolCall,
): Promise<ToolExecutionResult> {
  const name = toolCall.function.name;
  const args = safeJsonParse<Record<string, unknown>>(toolCall.function.arguments) ?? {};

  let result = "";
  if (name === "ask_clarification") {
    const clarification = buildClarificationFence(args.questions ?? args);
    if (!clarification) throw new Error("ask_clarification requires at least one valid question.");
    result = clarification.text;
  } else if (name === "ask_yes_no") {
    const question = normalizeText(String(args.question ?? ""));
    if (!question) throw new Error("ask_yes_no requires a non-empty question.");
    result = buildYesNoFence(question);
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return {
    toolCallId: toolCall.id,
    name,
    description: describeStreamingToolCall(toolCall),
    result,
  };
}
