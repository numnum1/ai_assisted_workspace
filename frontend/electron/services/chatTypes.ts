import type { ChatMessage } from "../../src/shared/types.js";
import type { ContextBlock } from "./conversation/contextBlocks.js";

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
  maxToolRounds: number;
}

export type ChatStreamEvent =
  | {
      type: "context";
      data: {
        includedFiles: string[];
        estimatedTokens: number;
        maxContextTokens?: number;
      };
    }
  | { type: "token"; data: string }
  | { type: "tool_call"; data: string }
  | { type: "tool_history"; data: ChatMessage[] }
  | { type: "resolved_user_message"; data: string }
  | { type: "context_update"; data: { estimatedTokens: number } }
  | { type: "done"; data: { fullAssistantText: string } }
  | { type: "error"; data: { message: string } };

export interface ChatStreamStartResult {
  streamId: string;
}
