import type { ChatMessage } from "../../src/types.js";
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
  | { type: "error"; data: { message: string } }
  | { type: "navi_state"; data: { stateId: string; completedStateId?: string; summary?: string } }
  | { type: "navi_plan"; data: { plan: string } }
  | { type: "navi_tips_covered"; data: { coveredIds: string[] } }
  | { type: "navi_problems"; data: { current: string; interpretation?: string; queue: string[] } }
  | { type: "navi_step"; data: { label: string | null } }
  | { type: "navi_context"; data: import("../../src/types.js").NaviContext };

export interface ChatStreamStartResult {
  streamId: string;
}
